package desktop

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"figaro/internal/updates"

	"github.com/wailsapp/wails/v3/pkg/updater"
)

type recordingUpdateHost struct{ events []string }

func (h *recordingUpdateHost) Emit(name string, _ ...any) bool {
	h.events = append(h.events, name)
	return false
}
func (h *recordingUpdateHost) OnEvent(string, func(any)) func() { return func() {} }
func (h *recordingUpdateHost) OpenWindow(updater.WindowOptions) updater.WindowHandle {
	return nil
}
func (h *recordingUpdateHost) Quit() {}

func updateArchive(t *testing.T, executable string, payload []byte) []byte {
	t.Helper()
	var buffer bytes.Buffer
	compressed := gzip.NewWriter(&buffer)
	archive := tar.NewWriter(compressed)
	if err := archive.WriteHeader(&tar.Header{Name: executable, Mode: 0755, Size: int64(len(payload)), Typeflag: tar.TypeReg}); err != nil {
		t.Fatal(err)
	}
	if _, err := archive.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := compressed.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

// fakeGitHubReleases serves the subset of the Releases API the Wails provider
// reads: the latest release, and asset downloads by API URL.
func fakeGitHubReleases(t *testing.T, tag string, assets map[string][]byte) *httptest.Server {
	t.Helper()
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/repos/"+updates.Repository+"/releases/latest":
			type asset struct {
				ID   int64  `json:"id"`
				Name string `json:"name"`
				Size int64  `json:"size"`
				URL  string `json:"url"`
			}
			listed := []asset{}
			id := int64(1)
			for name, body := range assets {
				listed = append(listed, asset{ID: id, Name: name, Size: int64(len(body)), URL: server.URL + "/assets/" + name})
				id++
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"tag_name": tag,
				"name":     "Figaro " + tag,
				"body":     "### Fixed\n- Things",
				"assets":   listed,
			})
		case len(r.URL.Path) > len("/assets/") && r.URL.Path[:len("/assets/")] == "/assets/":
			body, ok := assets[r.URL.Path[len("/assets/"):]]
			if !ok || r.Header.Get("Accept") != "application/octet-stream" {
				http.NotFound(w, r)
				return
			}
			_, _ = w.Write(body)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	return server
}

func TestGitHubUpdaterStagesThePublishedUpdateArchive(t *testing.T) {
	if !updates.Published(runtime.GOOS, runtime.GOARCH) || runtime.GOOS != "linux" {
		t.Skip("the tar.gz update archive is the Linux release format")
	}
	const tag = "v1.47.0"
	payload := []byte("#!/bin/sh\necho figaro 1.47.0\n")
	updateName := updates.ArchiveName(tag, runtime.GOOS, runtime.GOARCH)
	archive := updateArchive(t, "figaro", payload)
	digest := sha256.Sum256(archive)
	server := fakeGitHubReleases(t, tag, map[string][]byte{
		"figaro-" + tag + "-linux-amd64.tar.gz": updateArchive(t, "figaro-"+tag+"-linux-amd64/figaro", payload),
		updateName:                              archive,
		updates.ChecksumAsset:                   []byte(fmt.Sprintf("%s  %s\n", hex.EncodeToString(digest[:]), updateName)),
	})

	provider, err := newGitHubUpdateProvider(server.URL, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	host := &recordingUpdateHost{}
	engine := updater.New(host)
	if err := initGitHubUpdater(engine, "1.46.0", provider); err != nil {
		t.Fatal(err)
	}
	service := wailsUpdateService{updater: engine}

	release, err := service.Check(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if release == nil || release.Version != "1.47.0" || release.URL != "https://github.com/grilo/figaro/releases/tag/v1.47.0" {
		t.Fatalf("Check = %#v", release)
	}
	if err := service.Install(context.Background()); err != nil {
		t.Fatalf("Install: %v (events %v)", err, host.events)
	}
	staged := engine.DownloadedPath()
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Dir(staged)) })
	if filepath.Base(staged) != "figaro" {
		t.Fatalf("staged %q, want the executable itself rather than an archive folder", staged)
	}
	got, err := os.ReadFile(staged)
	if err != nil || !bytes.Equal(got, payload) {
		t.Fatalf("staged payload = %q, %v", got, err)
	}
	if engine.State() != updater.StateReady {
		t.Fatalf("updater state = %s, want ready", engine.State())
	}
}

func TestGitHubUpdaterRejectsAnArchiveThatFailsItsChecksum(t *testing.T) {
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" {
		t.Skip("the tar.gz update archive is the Linux release format")
	}
	const tag = "v1.47.0"
	updateName := updates.ArchiveName(tag, runtime.GOOS, runtime.GOARCH)
	server := fakeGitHubReleases(t, tag, map[string][]byte{
		updateName:            updateArchive(t, "figaro", []byte("tampered")),
		updates.ChecksumAsset: []byte(fmt.Sprintf("%064x  %s\n", 0, updateName)),
	})
	provider, err := newGitHubUpdateProvider(server.URL, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	engine := updater.New(&recordingUpdateHost{})
	if err := initGitHubUpdater(engine, "1.46.0", provider); err != nil {
		t.Fatal(err)
	}
	service := wailsUpdateService{updater: engine}
	if _, err := service.Check(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := service.Install(context.Background()); err == nil {
		t.Fatal("tampered archive was staged")
	}
	if engine.State() == updater.StateReady {
		t.Fatal("updater reported a tampered archive as ready")
	}
}

func TestGitHubUpdaterReportsANewerReleaseWithoutAnUpdateArchive(t *testing.T) {
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" {
		t.Skip("asset names below are the Linux release format")
	}
	server := fakeGitHubReleases(t, "v1.47.0", map[string][]byte{
		"figaro-v1.47.0-linux-amd64.tar.gz": []byte("download archive"),
		updates.ChecksumAsset:               []byte("00  figaro-v1.47.0-linux-amd64.tar.gz\n"),
	})
	provider, err := newGitHubUpdateProvider(server.URL, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	engine := updater.New(&recordingUpdateHost{})
	if err := initGitHubUpdater(engine, "1.46.0", provider); err != nil {
		t.Fatal(err)
	}
	// The ordinary download archive must never be offered for an in-place
	// swap; the user is told the release cannot be installed from here.
	release, err := wailsUpdateService{updater: engine}.Check(context.Background())
	if err == nil || release != nil {
		t.Fatalf("release without update archive = %#v, %v", release, err)
	}
}

func TestGitHubUpdaterTreatsTheRunningReleaseAsCurrentWithoutUpdateArchives(t *testing.T) {
	server := fakeGitHubReleases(t, "v1.46.0", map[string][]byte{
		"figaro-v1.46.0-linux-amd64.tar.gz": []byte("download archive"),
	})
	provider, err := newGitHubUpdateProvider(server.URL, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	engine := updater.New(&recordingUpdateHost{})
	if err := initGitHubUpdater(engine, "1.46.0", provider); err != nil {
		t.Fatal(err)
	}
	release, err := wailsUpdateService{updater: engine}.Check(context.Background())
	if err != nil || release != nil {
		t.Fatalf("running release = %#v, %v; want up to date", release, err)
	}
}
