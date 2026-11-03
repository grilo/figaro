package desktop

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

type fakeUpdateService struct {
	release    *updateRelease
	checkErr   error
	installErr error
	checks     int
	installs   int
	restarts   int
}

func (f *fakeUpdateService) Check(context.Context) (*updateRelease, error) {
	f.checks++
	return f.release, f.checkErr
}

func (f *fakeUpdateService) Install(context.Context) error {
	f.installs++
	return f.installErr
}

func (f *fakeUpdateService) Restart(context.Context) error {
	f.restarts++
	return nil
}

func newUpdateTestApp(t *testing.T, service updateService) *App {
	t.Helper()
	app := NewApp(filepath.Join(t.TempDir(), "vault"))
	app.configureMachineSettings(filepath.Join(t.TempDir(), "figaro", "machine-settings.json"))
	if service != nil {
		app.setUpdateService(service, "1.46.0")
	}
	return app
}

func TestUpdateChecksAreOffUntilTheUserOptsIn(t *testing.T) {
	service := &fakeUpdateService{release: &updateRelease{Version: "1.47.0"}}
	app := newUpdateTestApp(t, service)

	settings, err := app.UpdateSettingsLoad()
	if err != nil || !settings.Success || settings.Enabled || !settings.Supported {
		t.Fatalf("default update settings = %#v, %v", settings, err)
	}
	if status, _ := app.UpdateStartupCheck(); status != nil || service.checks != 0 {
		t.Fatalf("startup contacted GitHub without opt-in: status=%#v checks=%d", status, service.checks)
	}

	if saved, _ := app.UpdateSettingsSave(true); !saved.Success || !saved.Enabled {
		t.Fatalf("saving opt-in = %#v", saved)
	}
	if reloaded, _ := app.UpdateSettingsLoad(); !reloaded.Enabled {
		t.Fatal("opt-in was not persisted in machine-local settings")
	}
}

func TestStartupCheckReportsOnlyAnAvailableReleaseOncePerLaunch(t *testing.T) {
	startupCheck := func(service *fakeUpdateService) (*UpdateStatus, *App) {
		app := newUpdateTestApp(t, service)
		if _, err := app.UpdateSettingsSave(true); err != nil {
			t.Fatal(err)
		}
		status, err := app.UpdateStartupCheck()
		if err != nil {
			t.Fatal(err)
		}
		return status, app
	}

	if status, _ := startupCheck(&fakeUpdateService{}); status != nil {
		t.Fatalf("up-to-date startup check reported %#v", status)
	}
	if status, _ := startupCheck(&fakeUpdateService{checkErr: errors.New("network unreachable")}); status != nil {
		t.Fatalf("failed startup check reported %#v", status)
	}

	service := &fakeUpdateService{release: &updateRelease{Version: "1.47.0", URL: "https://github.com/grilo/figaro/releases/tag/v1.47.0"}}
	status, app := startupCheck(service)
	if status == nil || status.State != updateStateAvailable || status.Version != "1.47.0" || status.CurrentVersion != "1.46.0" {
		t.Fatalf("available release reported as %#v", status)
	}
	if again, _ := app.UpdateStartupCheck(); again != nil || service.checks != 1 {
		t.Fatalf("second startup check in one launch = %#v after %d checks", again, service.checks)
	}
}

func TestUpdateCheckInstallAndRestartReportEachOutcome(t *testing.T) {
	service := &fakeUpdateService{}
	app := newUpdateTestApp(t, service)

	if status, _ := app.UpdateCheck(); status.State != updateStateUpToDate || status.CurrentVersion != "1.46.0" {
		t.Fatalf("current build status = %#v", status)
	}
	service.release = &updateRelease{Version: "1.47.0", Notes: "Fixed things"}
	if status, _ := app.UpdateCheck(); status.State != updateStateAvailable || status.Version != "1.47.0" || status.Notes != "Fixed things" {
		t.Fatalf("available status = %#v", status)
	}
	service.checkErr = errors.New("rate limited")
	if status, _ := app.UpdateCheck(); status.State != updateStateError || status.Error != "rate limited" {
		t.Fatalf("failed check status = %#v", status)
	}

	service.installErr = errors.New("checksum mismatch")
	if status, _ := app.UpdateInstall(); status.State != updateStateError || status.Error != "checksum mismatch" {
		t.Fatalf("failed install status = %#v", status)
	}
	service.installErr = nil
	if status, _ := app.UpdateInstall(); status.State != updateStateReady {
		t.Fatalf("staged install status = %#v", status)
	}
	if status, _ := app.UpdateRestart(); status.State != updateStateReady || service.restarts != 1 {
		t.Fatalf("restart status = %#v after %d restarts", status, service.restarts)
	}
}

func TestBuildsWithoutAnUpdaterReportUnsupported(t *testing.T) {
	app := newUpdateTestApp(t, nil)
	if settings, _ := app.UpdateSettingsLoad(); settings.Supported {
		t.Fatalf("unsupported build reported %#v", settings)
	}
	for _, call := range []func() (*UpdateStatus, error){app.UpdateCheck, app.UpdateInstall, app.UpdateRestart} {
		if status, _ := call(); status.State != updateStateUnsupported {
			t.Fatalf("unsupported build status = %#v", status)
		}
	}
}
