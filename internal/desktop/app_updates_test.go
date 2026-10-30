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
	emitted := 0
	app.desktopRuntime.configureForTest(context.Background(), true, nil, func(string, ...any) { emitted++ })

	settings, err := app.UpdateSettingsLoad()
	if err != nil || !settings.Success || settings.Enabled || !settings.Supported {
		t.Fatalf("default update settings = %#v, %v", settings, err)
	}
	app.checkForUpdatesAtStartup()
	if service.checks != 0 || emitted != 0 {
		t.Fatalf("startup contacted GitHub without opt-in: checks=%d events=%d", service.checks, emitted)
	}

	if saved, _ := app.UpdateSettingsSave(true); !saved.Success || !saved.Enabled {
		t.Fatalf("saving opt-in = %#v", saved)
	}
	if reloaded, _ := app.UpdateSettingsLoad(); !reloaded.Enabled {
		t.Fatal("opt-in was not persisted in machine-local settings")
	}
}

func TestStartupCheckAnnouncesOnlyAnAvailableRelease(t *testing.T) {
	service := &fakeUpdateService{}
	app := newUpdateTestApp(t, service)
	var events []string
	var announced *UpdateStatus
	app.desktopRuntime.configureForTest(context.Background(), true, nil, func(name string, data ...any) {
		events = append(events, name)
		if len(data) == 1 {
			announced, _ = data[0].(*UpdateStatus)
		}
	})
	if _, err := app.UpdateSettingsSave(true); err != nil {
		t.Fatal(err)
	}

	app.checkForUpdatesAtStartup()
	service.checkErr = errors.New("network unreachable")
	app.checkForUpdatesAtStartup()
	if len(events) != 0 {
		t.Fatalf("up-to-date or failed checks emitted %v", events)
	}

	service.checkErr = nil
	service.release = &updateRelease{Version: "1.47.0", URL: "https://github.com/grilo/figaro/releases/tag/v1.47.0"}
	app.checkForUpdatesAtStartup()
	if len(events) != 1 || events[0] != updateAvailableEventName || announced == nil || announced.Version != "1.47.0" {
		t.Fatalf("available release announced as %v %#v", events, announced)
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
