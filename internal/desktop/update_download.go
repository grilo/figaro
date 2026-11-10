package desktop

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"time"

	"figaro/internal/updates"

	"github.com/wailsapp/wails/v3/pkg/updater"
)

// updateHTTPLimits bounds a connection that has stopped, not one that is
// slow. There is deliberately no limit on the whole request: an update
// archive on a slow link takes as long as it takes, provided bytes keep
// arriving.
type updateHTTPLimits struct {
	// dial bounds establishing the TCP connection.
	dial time.Duration
	// tlsHandshake bounds the TLS handshake that follows.
	tlsHandshake time.Duration
	// responseHeader bounds the wait for the server's response headers once
	// the request has been written.
	responseHeader time.Duration
	// stall bounds the wait for the next bytes of a response body.
	stall time.Duration
}

var productionUpdateHTTPLimits = updateHTTPLimits{
	dial:           15 * time.Second,
	tlsHandshake:   15 * time.Second,
	responseHeader: 30 * time.Second,
	stall:          60 * time.Second,
}

// updateInstallCeiling is the last-resort bound on one download, verification
// and staging. Stalled connections end long before it through
// updateHTTPLimits; it only stops a transfer that trickles without end.
const updateInstallCeiling = 6 * time.Hour

// errUpdateDownloadStalled reports a response body that stopped delivering
// bytes for longer than updateHTTPLimits.stall.
var errUpdateDownloadStalled = errors.New("the download stalled")

// newUpdateHTTPClient returns the client the updater uses for the GitHub API
// and for release downloads. It has no total timeout.
func newUpdateHTTPClient(limits updateHTTPLimits) *http.Client {
	var transport *http.Transport
	if base, ok := http.DefaultTransport.(*http.Transport); ok {
		transport = base.Clone()
	} else {
		transport = &http.Transport{Proxy: http.ProxyFromEnvironment, ForceAttemptHTTP2: true}
	}
	transport.DialContext = (&net.Dialer{Timeout: limits.dial, KeepAlive: 30 * time.Second}).DialContext
	transport.TLSHandshakeTimeout = limits.tlsHandshake
	transport.ResponseHeaderTimeout = limits.responseHeader
	return &http.Client{Transport: stallGuardTransport{base: transport, stall: limits.stall}}
}

// stallGuardTransport ends a response whose body makes no progress. net/http
// can bound the connection, the handshake and the headers, but has no timeout
// for a body that goes quiet part-way; a total request timeout is the usual
// substitute and is exactly what fails a slow download.
type stallGuardTransport struct {
	base  http.RoundTripper
	stall time.Duration
}

func (t stallGuardTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	ctx, cancel := context.WithCancelCause(request.Context())
	response, err := t.base.RoundTrip(request.WithContext(ctx))
	if err != nil {
		cancel(nil)
		return nil, err
	}
	response.Body = &stallGuardBody{body: response.Body, ctx: ctx, cancel: cancel, stall: t.stall}
	return response, nil
}

type stallGuardBody struct {
	body   io.ReadCloser
	ctx    context.Context
	cancel context.CancelCauseFunc
	stall  time.Duration
	timer  *time.Timer
}

// Read arms the stall timer only while it waits for bytes, so a reader that
// is slow to come back (a busy disk) is never mistaken for a quiet server.
func (b *stallGuardBody) Read(buffer []byte) (int, error) {
	if b.timer == nil {
		b.timer = time.AfterFunc(b.stall, func() { b.cancel(errUpdateDownloadStalled) })
	} else {
		b.timer.Reset(b.stall)
	}
	read, err := b.body.Read(buffer)
	b.timer.Stop()
	if err != nil && err != io.EOF && errors.Is(context.Cause(b.ctx), errUpdateDownloadStalled) {
		return read, fmt.Errorf("%w: no data arrived for %s", errUpdateDownloadStalled, b.stall)
	}
	return read, err
}

func (b *stallGuardBody) Close() error {
	if b.timer != nil {
		b.timer.Stop()
	}
	err := b.body.Close()
	b.cancel(nil)
	return err
}

// checksumRequiredProvider makes verification mandatory. The Wails GitHub
// provider attaches a digest only when the release has a SHA256SUMS file with
// a line for the chosen archive; without one the engine installs the download
// unverified. This wrapper refuses such a release before a byte is fetched.
type checksumRequiredProvider struct {
	updater.Provider
}

func (p checksumRequiredProvider) Check(ctx context.Context, request updater.CheckRequest) (*updater.Release, error) {
	release, err := p.Provider.Check(ctx, request)
	if err == nil && release != nil {
		if refusal := requireReleaseChecksum(release); refusal != nil {
			log.Printf("[updates] Release %s is available but will not be installed: %v", release.Version, refusal)
		}
	}
	return release, err
}

func (p checksumRequiredProvider) Download(ctx context.Context, release *updater.Release, destination io.Writer, onProgress func(written, total int64)) error {
	if err := requireReleaseChecksum(release); err != nil {
		return err
	}
	return p.Provider.Download(ctx, release, destination, onProgress)
}

func requireReleaseChecksum(release *updater.Release) error {
	if release == nil {
		return errors.New("no release was selected for download")
	}
	algorithm, digest := "", []byte(nil)
	if release.Verification != nil {
		algorithm, digest = release.Verification.DigestAlgo, release.Verification.Digest
	}
	return updates.RequireChecksum(release.Artifact.Filename, algorithm, digest)
}
