package desktop

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	"figaro/internal/updates"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

// updateRelease is the part of a published release the frontend may show.
type updateRelease struct {
	Version string
	Notes   string
	URL     string
}

// updateService is the self-update effect boundary. A nil release from Check
// means the running build is current.
type updateService interface {
	Check(context.Context) (*updateRelease, error)
	Install(context.Context) error
	Restart(context.Context) error
}

// UpdateSettingsResult reports whether automatic update checks are enabled and
// whether this build can update itself at all.
type UpdateSettingsResult struct {
	Success        bool   `json:"success"`
	Enabled        bool   `json:"enabled"`
	Supported      bool   `json:"supported"`
	CurrentVersion string `json:"currentVersion,omitempty"`
	Error          string `json:"error,omitempty"`
}

// UpdateStatus describes the outcome of a check or an install.
type UpdateStatus struct {
	State          string `json:"state"`
	CurrentVersion string `json:"currentVersion,omitempty"`
	Version        string `json:"version,omitempty"`
	Notes          string `json:"notes,omitempty"`
	URL            string `json:"url,omitempty"`
	Error          string `json:"error,omitempty"`
}

const (
	updateStateUnsupported = "unsupported"
	updateStateUpToDate    = "up-to-date"
	updateStateAvailable   = "available"
	updateStateReady       = "ready"
	updateStateError       = "error"
)

type updateCoordinator struct {
	mu             sync.Mutex
	service        updateService
	currentVersion string
	startupCheck   sync.Once
}

func (a *App) updateState() (updateService, string) {
	a.updates.mu.Lock()
	defer a.updates.mu.Unlock()
	return a.updates.service, a.updates.currentVersion
}

func (a *App) setUpdateService(service updateService, currentVersion string) {
	a.updates.mu.Lock()
	defer a.updates.mu.Unlock()
	a.updates.service = service
	a.updates.currentVersion = currentVersion
}

// UpdateSettingsLoad returns the machine-local opt-in for update checks.
func (a *App) UpdateSettingsLoad() (*UpdateSettingsResult, error) {
	service, version := a.updateState()
	enabled, err := a.loadUpdateChecksEnabled()
	if err != nil {
		return &UpdateSettingsResult{Success: false, Supported: service != nil, CurrentVersion: version, Error: err.Error()}, nil
	}
	return &UpdateSettingsResult{Success: true, Enabled: enabled, Supported: service != nil, CurrentVersion: version}, nil
}

// UpdateSettingsSave stores the opt-in. Figaro never contacts GitHub for
// updates unless the user enabled checks or asked for one explicitly.
func (a *App) UpdateSettingsSave(enabled bool) (*UpdateSettingsResult, error) {
	service, version := a.updateState()
	if err := a.storeUpdateChecksEnabled(enabled); err != nil {
		return &UpdateSettingsResult{Success: false, Supported: service != nil, CurrentVersion: version, Error: err.Error()}, nil
	}
	return &UpdateSettingsResult{Success: true, Enabled: enabled, Supported: service != nil, CurrentVersion: version}, nil
}

// UpdateCheck asks GitHub Releases whether a newer Figaro is published.
func (a *App) UpdateCheck() (*UpdateStatus, error) {
	service, version := a.updateState()
	if service == nil {
		return &UpdateStatus{State: updateStateUnsupported, CurrentVersion: version}, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	release, err := service.Check(ctx)
	if err != nil {
		return &UpdateStatus{State: updateStateError, CurrentVersion: version, Error: describeUpdateError(err)}, nil
	}
	if release == nil {
		return &UpdateStatus{State: updateStateUpToDate, CurrentVersion: version}, nil
	}
	return &UpdateStatus{
		State:          updateStateAvailable,
		CurrentVersion: version,
		Version:        release.Version,
		Notes:          release.Notes,
		URL:            release.URL,
	}, nil
}

// UpdateInstall downloads, verifies and stages the release found by the last
// check. The running application is replaced only by UpdateRestart.
func (a *App) UpdateInstall() (*UpdateStatus, error) {
	service, version := a.updateState()
	if service == nil {
		return &UpdateStatus{State: updateStateUnsupported, CurrentVersion: version}, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	if err := service.Install(ctx); err != nil {
		return &UpdateStatus{State: updateStateError, CurrentVersion: version, Error: describeUpdateError(err)}, nil
	}
	return &UpdateStatus{State: updateStateReady, CurrentVersion: version}, nil
}

// UpdateRestart quits Figaro so the staged update replaces it and relaunches.
func (a *App) UpdateRestart() (*UpdateStatus, error) {
	service, version := a.updateState()
	if service == nil {
		return &UpdateStatus{State: updateStateUnsupported, CurrentVersion: version}, nil
	}
	if err := service.Restart(context.Background()); err != nil {
		return &UpdateStatus{State: updateStateError, CurrentVersion: version, Error: describeUpdateError(err)}, nil
	}
	return &UpdateStatus{State: updateStateReady, CurrentVersion: version}, nil
}

// UpdateStartupCheck runs the opted-in check once per launch and reports only
// an available release. The frontend asks once its update prompt is ready, so
// a fast reply cannot arrive before anything is listening; failures stay in
// the log rather than interrupting writing.
func (a *App) UpdateStartupCheck() (*UpdateStatus, error) {
	first := false
	a.updates.startupCheck.Do(func() { first = true })
	if !first {
		return nil, nil
	}
	enabled, err := a.loadUpdateChecksEnabled()
	if err != nil || !enabled {
		return nil, nil
	}
	status, _ := a.UpdateCheck()
	if status == nil {
		return nil, nil
	}
	if status.State == updateStateError {
		log.Printf("[updates] Startup check failed: %s", status.Error)
		return nil, nil
	}
	if status.State != updateStateAvailable {
		return nil, nil
	}
	return status, nil
}

func releasePageURL(version string) string {
	if version == "" {
		return ""
	}
	return "https://github.com/" + updates.Repository + "/releases/tag/v" + strings.TrimPrefix(version, "v")
}

func describeUpdateError(err error) string {
	message := strings.TrimSpace(err.Error())
	if message == "" {
		return "The update could not be completed."
	}
	return message
}

// configureUpdater attaches the Wails GitHub Releases updater. Builds without
// a product version cannot compare releases and stay unsupported.
func (a *App) configureUpdater(wailsApp *application.App, productVersion string) {
	version, ok := updates.CurrentVersion(productVersion)
	if !ok || !updates.Published(goruntime.GOOS, goruntime.GOARCH) || wailsApp == nil || wailsApp.Updater == nil {
		log.Println("[updates] In-app updates are unavailable for this build")
		return
	}
	provider, err := newGitHubUpdateProvider("", nil)
	if err == nil {
		err = initGitHubUpdater(wailsApp.Updater, version, provider)
	}
	if err != nil {
		log.Printf("[updates] Could not configure GitHub releases: %v", err)
		return
	}
	a.setUpdateService(wailsUpdateService{updater: wailsApp.Updater}, version)
}

// newGitHubUpdateProvider reads Figaro's releases and picks only the
// platform's "-update" archive, verified against SHA256SUMS. baseURL and
// client are empty in production and point at a fake API in tests.
func newGitHubUpdateProvider(baseURL string, client *http.Client) (*github.Provider, error) {
	return github.New(github.Config{
		Repository:    updates.Repository,
		BaseURL:       baseURL,
		HTTPClient:    client,
		ChecksumAsset: updates.ChecksumAsset,
		AssetMatcher: func(request updater.CheckRequest, assets []github.ReleaseAsset) int {
			names := make([]string, len(assets))
			for i, asset := range assets {
				names[i] = asset.Name
			}
			return updates.MatchAsset(request.Platform, request.Arch, names)
		},
	})
}

func initGitHubUpdater(engine *updater.Updater, version string, provider updater.Provider) error {
	return engine.Init(updater.Config{
		CurrentVersion: version,
		Providers:      []updater.Provider{provider},
		Window:         updater.WindowNone,
		// Figaro opens its vault after application.New, so the relaunched
		// helper reaches readiness quickly; allow slow disks some headroom.
		HelperReadyTimeout: time.Minute,
	})
}

// wailsUpdateService adapts the Wails updater to Figaro's update port.
type wailsUpdateService struct {
	updater *updater.Updater
}

func (s wailsUpdateService) Check(ctx context.Context) (*updateRelease, error) {
	release, err := s.updater.Check(ctx)
	if err != nil {
		return nil, err
	}
	if release == nil {
		return nil, nil
	}
	return &updateRelease{Version: release.Version, Notes: release.Notes, URL: releasePageURL(release.Version)}, nil
}

func (s wailsUpdateService) Install(ctx context.Context) error {
	if err := s.updater.DownloadAndInstall(ctx); err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return fmt.Errorf("the download did not finish in time")
		}
		return err
	}
	return nil
}

func (s wailsUpdateService) Restart(ctx context.Context) error {
	return s.updater.Restart(ctx)
}
