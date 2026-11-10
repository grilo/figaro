package desktop

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"figaro/internal/updates"

	"github.com/wailsapp/wails/v3/pkg/updater"
)

// testUpdateHTTPLimits keeps every stall bound far below the time a slow test
// download takes in total, so only a missing total timeout lets it finish.
var testUpdateHTTPLimits = updateHTTPLimits{
	dial:           2 * time.Second,
	tlsHandshake:   2 * time.Second,
	responseHeader: 400 * time.Millisecond,
	stall:          400 * time.Millisecond,
}

func TestUpdateHTTPClientHasNoTotalTimeoutAndBoundsEachStallPoint(t *testing.T) {
	client := newUpdateHTTPClient(productionUpdateHTTPLimits)
	if client.Timeout != 0 {
		t.Fatalf("update client total timeout = %s, want none", client.Timeout)
	}
	guard, ok := client.Transport.(stallGuardTransport)
	if !ok || guard.stall != productionUpdateHTTPLimits.stall || guard.stall <= 0 {
		t.Fatalf("update client transport = %#v, want the stall guard", client.Transport)
	}
	transport, ok := guard.base.(*http.Transport)
	if !ok {
		t.Fatalf("stall guard wraps %T, want *http.Transport", guard.base)
	}
	if transport.TLSHandshakeTimeout != productionUpdateHTTPLimits.tlsHandshake ||
		transport.ResponseHeaderTimeout != productionUpdateHTTPLimits.responseHeader ||
		transport.DialContext == nil || transport.Proxy == nil {
		t.Fatalf("transport limits = handshake %s, headers %s", transport.TLSHandshakeTimeout, transport.ResponseHeaderTimeout)
	}
	if updateInstallCeiling < time.Hour {
		t.Fatalf("install ceiling = %s; it must not be the limit a slow download meets", updateInstallCeiling)
	}
}

// A slow link delivers the archive in small pieces. Each wait is shorter than
// the stall bound, but the whole transfer takes several times longer than any
// single bound: only a total timeout would fail it.
func TestUpdateHTTPClientLetsASlowProgressingDownloadFinish(t *testing.T) {
	const pieces = 12
	const pause = 120 * time.Millisecond
	piece := bytes.Repeat([]byte("figaro "), 64)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		flusher := writer.(http.Flusher)
		for index := 0; index < pieces; index++ {
			if _, err := writer.Write(piece); err != nil {
				return
			}
			flusher.Flush()
			select {
			case <-request.Context().Done():
				return
			case <-time.After(pause):
			}
		}
	}))
	defer server.Close()

	started := time.Now()
	response, err := newUpdateHTTPClient(testUpdateHTTPLimits).Get(server.URL)
	if err != nil {
		t.Fatalf("slow download request: %v", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("slow download failed after %s: %v", time.Since(started), err)
	}
	if len(body) != pieces*len(piece) {
		t.Fatalf("slow download delivered %d bytes, want %d", len(body), pieces*len(piece))
	}
	if elapsed := time.Since(started); elapsed <= 2*testUpdateHTTPLimits.stall {
		t.Fatalf("download took %s; it must outlast the stall bound of %s to prove anything", elapsed, testUpdateHTTPLimits.stall)
	}
}

func TestUpdateHTTPClientEndsADownloadThatStopsMakingProgress(t *testing.T) {
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		_, _ = writer.Write([]byte("first bytes"))
		writer.(http.Flusher).Flush()
		select {
		case <-request.Context().Done():
		case <-release:
		}
	}))
	defer server.Close()
	defer close(release)

	started := time.Now()
	response, err := newUpdateHTTPClient(testUpdateHTTPLimits).Get(server.URL)
	if err != nil {
		t.Fatalf("stalling download request: %v", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if !errors.Is(err, errUpdateDownloadStalled) {
		t.Fatalf("stalled download = %q, %v; want the stall reported", body, err)
	}
	if string(body) != "first bytes" {
		t.Fatalf("bytes before the stall = %q", body)
	}
	if elapsed := time.Since(started); elapsed > 10*testUpdateHTTPLimits.stall {
		t.Fatalf("stalled download was held for %s, far beyond the %s bound", elapsed, testUpdateHTTPLimits.stall)
	}
}

func TestUpdateHTTPClientEndsARequestWhoseResponseHeadersNeverArrive(t *testing.T) {
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		select {
		case <-request.Context().Done():
		case <-release:
		}
	}))
	defer server.Close()
	defer close(release)

	started := time.Now()
	response, err := newUpdateHTTPClient(testUpdateHTTPLimits).Get(server.URL)
	if err == nil {
		response.Body.Close()
		t.Fatal("a server that never answered was waited for without a bound")
	}
	if elapsed := time.Since(started); elapsed > 10*testUpdateHTTPLimits.responseHeader {
		t.Fatalf("silent server was waited for %s, far beyond the %s bound", elapsed, testUpdateHTTPLimits.responseHeader)
	}
}

// countingGitHubReleases is fakeGitHubReleases plus a count of downloads of
// one asset, to prove a refused release is never fetched.
func countingGitHubReleases(t *testing.T, tag string, assets map[string][]byte, counted string) (*httptest.Server, *atomic.Int64) {
	t.Helper()
	inner := fakeGitHubReleases(t, tag, assets)
	downloads := &atomic.Int64{}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/assets/"+counted {
			downloads.Add(1)
		}
		proxied, err := http.NewRequestWithContext(request.Context(), request.Method, inner.URL+request.URL.RequestURI(), nil)
		if err != nil {
			http.Error(writer, err.Error(), http.StatusInternalServerError)
			return
		}
		proxied.Header = request.Header.Clone()
		response, err := inner.Client().Do(proxied)
		if err != nil {
			http.Error(writer, err.Error(), http.StatusBadGateway)
			return
		}
		defer response.Body.Close()
		body, _ := io.ReadAll(response.Body)
		// Asset URLs in the release listing point at the inner server; send
		// downloads back through this one so they are counted.
		body = bytes.ReplaceAll(body, []byte(inner.URL), []byte("http://"+request.Host))
		writer.WriteHeader(response.StatusCode)
		_, _ = writer.Write(body)
	}))
	t.Cleanup(server.Close)
	return server, downloads
}

// Verification is mandatory. A release whose SHA256SUMS is missing, or has no
// line for this platform's archive, is reported as available but is never
// downloaded or staged.
func TestGitHubUpdaterRefusesAReleaseItCannotVerify(t *testing.T) {
	if !updates.Published(runtime.GOOS, runtime.GOARCH) {
		t.Skip("no update archive is published for this platform")
	}
	const tag = "v1.47.0"
	updateName := updates.ArchiveName(tag, runtime.GOOS, runtime.GOARCH)
	archive := updateArchive(t, "figaro", []byte("unverifiable payload"))
	other := sha256.Sum256([]byte("another archive"))
	for name, assets := range map[string]map[string][]byte{
		"no checksum file": {
			updateName: archive,
		},
		"checksum file without a line for the archive": {
			updateName:            archive,
			updates.ChecksumAsset: []byte(fmt.Sprintf("%s  figaro-%s-other-platform-update.zip\n", hex.EncodeToString(other[:]), tag)),
		},
		"empty checksum file": {
			updateName:            archive,
			updates.ChecksumAsset: []byte("\n"),
		},
		"checksum that is not a SHA-256 digest": {
			updateName:            archive,
			updates.ChecksumAsset: []byte(fmt.Sprintf("%s  %s\n", "00112233", updateName)),
		},
	} {
		t.Run(name, func(t *testing.T) {
			server, downloads := countingGitHubReleases(t, tag, assets, updateName)
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
			if err != nil || release == nil || release.Version != "1.47.0" {
				t.Fatalf("Check = %#v, %v; want the newer release reported", release, err)
			}
			err = service.Install(context.Background())
			if err == nil {
				t.Fatal("a release without a usable checksum was staged")
			}
			for _, want := range []string{updateName, updates.ChecksumAsset, "did not install it"} {
				if !strings.Contains(err.Error(), want) {
					t.Fatalf("refusal %q does not mention %q", err, want)
				}
			}
			if got := downloads.Load(); got != 0 {
				t.Fatalf("the unverifiable archive was downloaded %d time(s)", got)
			}
			if engine.State() == updater.StateReady || engine.DownloadedPath() != "" {
				t.Fatalf("updater state = %s, staged %q; want nothing staged", engine.State(), engine.DownloadedPath())
			}
		})
	}
}

// The provider used in production must itself be the verifying one.
func TestGitHubUpdateProviderRequiresAChecksumAndKeepsTheProviderName(t *testing.T) {
	provider, err := newGitHubUpdateProvider("", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := provider.(checksumRequiredProvider); !ok {
		t.Fatalf("production provider is %T, want the checksum-requiring wrapper", provider)
	}
	if provider.Name() != "github" {
		t.Fatalf("provider name = %q; the engine routes downloads by it", provider.Name())
	}
	var destination bytes.Buffer
	err = provider.Download(context.Background(), &updater.Release{
		Version:  "1.47.0",
		Artifact: updater.Artifact{Filename: "figaro-v1.47.0-linux-amd64-update.tar.gz"},
		Metadata: map[string]any{"github.asset.url": "http://127.0.0.1:1/never-contacted"},
	}, &destination, func(int64, int64) {})
	if err == nil || !strings.Contains(err.Error(), "has no SHA-256 checksum") || destination.Len() != 0 {
		t.Fatalf("download without verification = %v (%d bytes written)", err, destination.Len())
	}
	if err := provider.Download(context.Background(), nil, &destination, func(int64, int64) {}); err == nil {
		t.Fatal("a download with no release was attempted")
	}
}

// The stall reaches the user as a sentence about the connection, not as the
// cancellation it is implemented with.
func TestUpdateInstallExplainsAStalledDownload(t *testing.T) {
	if !updates.Published(runtime.GOOS, runtime.GOARCH) {
		t.Skip("no update archive is published for this platform")
	}
	const tag = "v1.47.0"
	updateName := updates.ArchiveName(tag, runtime.GOOS, runtime.GOARCH)
	archive := updateArchive(t, "figaro", bytes.Repeat([]byte("payload "), 512))
	digest := sha256.Sum256(archive)
	releases := fakeGitHubReleases(t, tag, map[string][]byte{
		updateName:            archive,
		updates.ChecksumAsset: []byte(fmt.Sprintf("%s  %s\n", hex.EncodeToString(digest[:]), updateName)),
	})
	release := make(chan struct{})
	stalling := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/assets/"+updateName {
			proxied, _ := http.NewRequestWithContext(request.Context(), request.Method, releases.URL+request.URL.RequestURI(), nil)
			proxied.Header = request.Header.Clone()
			response, err := releases.Client().Do(proxied)
			if err != nil {
				http.Error(writer, err.Error(), http.StatusBadGateway)
				return
			}
			defer response.Body.Close()
			body, _ := io.ReadAll(response.Body)
			body = bytes.ReplaceAll(body, []byte(releases.URL), []byte("http://"+request.Host))
			writer.WriteHeader(response.StatusCode)
			_, _ = writer.Write(body)
			return
		}
		_, _ = writer.Write(archive[:len(archive)/2])
		writer.(http.Flusher).Flush()
		select {
		case <-request.Context().Done():
		case <-release:
		}
	}))
	defer stalling.Close()
	defer close(release)

	provider, err := newGitHubUpdateProvider(stalling.URL, newUpdateHTTPClient(testUpdateHTTPLimits))
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
	err = service.Install(context.Background())
	if err == nil || !strings.Contains(err.Error(), "the download stalled") || !strings.Contains(err.Error(), "Check the connection") {
		t.Fatalf("stalled install = %v; want the stall explained", err)
	}
	if strings.Contains(err.Error(), "context canceled") {
		t.Fatalf("stalled install leaked its mechanism: %v", err)
	}
	if engine.State() == updater.StateReady {
		t.Fatal("a half-downloaded archive was reported as ready")
	}
}
