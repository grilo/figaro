package pdfexport

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	browserRenderTimeout = 45 * time.Second
	browserStartTimeout  = 12 * time.Second
)

// RenderChromiumPDF renders through Chrome DevTools Protocol instead of
// Chromium's --print-to-pdf shortcut. The protocol exposes the same
// Page.printToPDF path used by browser automation, which retains PDF link
// annotations for document links, TOC entries, and footnote return links.
func RenderChromiumPDF(ctx context.Context, browser Browser, inputHTMLPath string, outputPDFPath string, profileDir string) error {
	if browser.Engine == EngineSafari {
		return errors.New("Safari uses the native macOS PDF renderer")
	}
	if strings.TrimSpace(browser.Executable) == "" {
		return errors.New("browser executable is empty")
	}
	if strings.TrimSpace(inputHTMLPath) == "" || strings.TrimSpace(outputPDFPath) == "" {
		return errors.New("browser PDF export received an empty file path")
	}
	if err := os.MkdirAll(profileDir, 0700); err != nil {
		return fmt.Errorf("create browser profile: %w", err)
	}

	renderCtx, cancel := context.WithTimeout(ctx, browserRenderTimeout)
	defer cancel()

	process, err := startChromiumProcess(renderCtx, browser, profileDir)
	if err != nil {
		return err
	}
	completed := false
	defer func() {
		if completed {
			process.waitForExitOrKill(2 * time.Second)
			return
		}
		process.killAndWait()
	}()

	endpoint, err := waitForDevToolsEndpoint(renderCtx, profileDir, process)
	if err != nil {
		return err
	}
	client, err := dialDevTools(renderCtx, endpoint)
	if err != nil {
		return fmt.Errorf("connect to browser PDF engine: %w", err)
	}
	defer client.Close()

	if err := renderPDFViaCDP(renderCtx, client, fileURL(inputHTMLPath), outputPDFPath); err != nil {
		return err
	}
	// Browser.close is intentionally best-effort. Once the PDF has been
	// written, a stubborn browser should not turn a successful export into a
	// failure; the deferred lifecycle guard will terminate it if needed.
	_ = client.notify(renderCtx, "Browser.close", nil, "")
	completed = true
	return nil
}

func chromiumLaunchArguments(profileDir string) []string {
	return []string{
		"--headless",
		"--disable-gpu",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-extensions",
		"--remote-debugging-address=127.0.0.1",
		// Let Chromium choose an ephemeral local port. It records the selected
		// port in DevToolsActivePort, avoiding a time-of-check/time-of-use race
		// where another local process could claim a hand-picked port.
		"--remote-debugging-port=0",
		"--user-data-dir=" + profileDir,
		"about:blank",
	}
}

type lockedBuffer struct {
	mu     sync.Mutex
	buffer bytes.Buffer
}

func (buffer *lockedBuffer) Write(data []byte) (int, error) {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	return buffer.buffer.Write(data)
}

func (buffer *lockedBuffer) String() string {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	return buffer.buffer.String()
}

type chromiumProcess struct {
	command *exec.Cmd
	output  *lockedBuffer
	done    chan struct{}

	mu      sync.Mutex
	waitErr error
}

func startChromiumProcess(ctx context.Context, browser Browser, profileDir string) (*chromiumProcess, error) {
	output := &lockedBuffer{}
	arguments := browserLaunchArguments(browser, profileDir)
	command := exec.CommandContext(ctx, browser.Executable, arguments...) // #nosec G204 -- executable and launcher arguments are selected from fixed local browser discovery heuristics.
	command.Stdout = output
	command.Stderr = output
	if err := command.Start(); err != nil {
		return nil, fmt.Errorf("start browser PDF engine: %w", err)
	}

	process := &chromiumProcess{command: command, output: output, done: make(chan struct{})}
	go func() {
		err := command.Wait()
		process.mu.Lock()
		process.waitErr = err
		process.mu.Unlock()
		close(process.done)
	}()
	return process, nil
}

func browserLaunchArguments(browser Browser, profileDir string) []string {
	arguments := append([]string(nil), browser.Arguments...)
	return append(arguments, chromiumLaunchArguments(profileDir)...)
}

func (process *chromiumProcess) exited() (bool, error) {
	select {
	case <-process.done:
		process.mu.Lock()
		defer process.mu.Unlock()
		return true, process.waitErr
	default:
		return false, nil
	}
}

func (process *chromiumProcess) waitForExitOrKill(grace time.Duration) {
	select {
	case <-process.done:
		return
	case <-time.After(grace):
		process.killAndWait()
	}
}

func (process *chromiumProcess) killAndWait() {
	if process == nil {
		return
	}
	if exited, _ := process.exited(); exited {
		return
	}
	if process.command.Process != nil {
		_ = process.command.Process.Kill()
	}
	select {
	case <-process.done:
	case <-time.After(2 * time.Second):
	}
}

func waitForDevToolsEndpoint(ctx context.Context, profileDir string, process *chromiumProcess) (string, error) {
	startCtx, cancel := context.WithTimeout(ctx, browserStartTimeout)
	defer cancel()
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	var lastErr error

	for {
		if endpoint, err := devToolsEndpoint(profileDir); err == nil {
			return endpoint, nil
		} else if !errors.Is(err, os.ErrNotExist) {
			lastErr = err
		}
		if exited, waitErr := process.exited(); exited {
			return "", browserProcessError("browser exited before its PDF engine became ready", waitErr, process.output.String())
		}
		select {
		case <-startCtx.Done():
			if errors.Is(startCtx.Err(), context.DeadlineExceeded) {
				if lastErr != nil {
					return "", fmt.Errorf("browser PDF engine did not become ready: %w", lastErr)
				}
				return "", errors.New("browser PDF engine did not become ready")
			}
			return "", startCtx.Err()
		case <-ticker.C:
		}
	}
}

func devToolsEndpoint(profileDir string) (string, error) {
	data, err := os.ReadFile(filepath.Join(profileDir, "DevToolsActivePort"))
	if err != nil {
		return "", err
	}
	parts := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(parts) < 2 {
		return "", errors.New("browser wrote an incomplete DevTools endpoint")
	}
	port, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || port < 1 || port > 65535 {
		return "", errors.New("browser wrote an invalid DevTools port")
	}
	path := strings.TrimSpace(parts[1])
	if !strings.HasPrefix(path, "/devtools/browser/") {
		return "", errors.New("browser wrote an invalid DevTools endpoint")
	}
	return "ws://127.0.0.1:" + strconv.Itoa(port) + path, nil
}

func browserProcessError(prefix string, waitErr error, output string) error {
	message := strings.TrimSpace(output)
	if len(message) > 600 {
		message = message[:600] + "…"
	}
	if message != "" {
		return fmt.Errorf("%s: %s", prefix, message)
	}
	if waitErr != nil {
		return fmt.Errorf("%s: %w", prefix, waitErr)
	}
	return errors.New(prefix)
}

type cdpError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

type cdpMessage struct {
	ID        int             `json:"id,omitempty"`
	Method    string          `json:"method,omitempty"`
	Params    json.RawMessage `json:"params,omitempty"`
	Result    json.RawMessage `json:"result,omitempty"`
	Error     *cdpError       `json:"error,omitempty"`
	SessionID string          `json:"sessionId,omitempty"`
}

type cdpClient struct {
	connection *websocket.Conn
	nextID     int
	events     []cdpMessage
}

func dialDevTools(ctx context.Context, endpoint string) (*cdpClient, error) {
	connection, _, err := websocket.DefaultDialer.DialContext(ctx, endpoint, nil)
	if err != nil {
		return nil, err
	}
	return &cdpClient{connection: connection}, nil
}

func (client *cdpClient) Close() error {
	if client == nil || client.connection == nil {
		return nil
	}
	return client.connection.Close()
}

func (client *cdpClient) call(ctx context.Context, method string, params any, sessionID string) (json.RawMessage, error) {
	client.nextID++
	id := client.nextID
	if err := client.write(ctx, cdpMessage{ID: id, Method: method, Params: marshalCDPParams(params), SessionID: sessionID}); err != nil {
		return nil, fmt.Errorf("send browser command %s: %w", method, err)
	}
	for {
		message, err := client.read(ctx)
		if err != nil {
			return nil, fmt.Errorf("read browser command %s: %w", method, err)
		}
		if message.ID != id {
			if message.Method != "" {
				client.events = append(client.events, message)
			}
			continue
		}
		if message.Error != nil {
			return nil, fmt.Errorf("browser command %s failed (%d): %s", method, message.Error.Code, message.Error.Message)
		}
		return message.Result, nil
	}
}

func (client *cdpClient) notify(ctx context.Context, method string, params any, sessionID string) error {
	client.nextID++
	return client.write(ctx, cdpMessage{ID: client.nextID, Method: method, Params: marshalCDPParams(params), SessionID: sessionID})
}

func (client *cdpClient) waitForEvent(ctx context.Context, method string, sessionID string) (cdpMessage, error) {
	for index, event := range client.events {
		if event.Method == method && (sessionID == "" || event.SessionID == sessionID) {
			client.events = append(client.events[:index], client.events[index+1:]...)
			return event, nil
		}
	}
	for {
		message, err := client.read(ctx)
		if err != nil {
			return cdpMessage{}, fmt.Errorf("wait for browser event %s: %w", method, err)
		}
		if message.Method == method && (sessionID == "" || message.SessionID == sessionID) {
			return message, nil
		}
		if message.Method != "" {
			client.events = append(client.events, message)
		}
	}
}

func (client *cdpClient) write(ctx context.Context, message cdpMessage) error {
	if deadline, ok := ctx.Deadline(); ok {
		if err := client.connection.SetWriteDeadline(deadline); err != nil {
			return err
		}
	}
	return client.connection.WriteJSON(message)
}

func (client *cdpClient) read(ctx context.Context) (cdpMessage, error) {
	if deadline, ok := ctx.Deadline(); ok {
		if err := client.connection.SetReadDeadline(deadline); err != nil {
			return cdpMessage{}, err
		}
	}
	var message cdpMessage
	if err := client.connection.ReadJSON(&message); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return cdpMessage{}, errors.New("browser PDF export timed out")
		}
		return cdpMessage{}, err
	}
	return message, nil
}

func marshalCDPParams(params any) json.RawMessage {
	if params == nil {
		return nil
	}
	data, err := json.Marshal(params)
	if err != nil {
		// All call sites use fixed protocol structures. Returning nil is safer
		// than serialising arbitrary malformed data into a browser command.
		return nil
	}
	return data
}

func renderPDFViaCDP(ctx context.Context, client *cdpClient, inputURL string, outputPDFPath string) error {
	createResult, err := client.call(ctx, "Target.createTarget", map[string]any{"url": "about:blank"}, "")
	if err != nil {
		return err
	}
	var target struct {
		TargetID string `json:"targetId"`
	}
	if err := json.Unmarshal(createResult, &target); err != nil || target.TargetID == "" {
		return errors.New("browser did not create a PDF document target")
	}
	attachResult, err := client.call(ctx, "Target.attachToTarget", map[string]any{"targetId": target.TargetID, "flatten": true}, "")
	if err != nil {
		return err
	}
	var attachment struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(attachResult, &attachment); err != nil || attachment.SessionID == "" {
		return errors.New("browser did not attach to the PDF document target")
	}

	if _, err := client.call(ctx, "Page.enable", nil, attachment.SessionID); err != nil {
		return err
	}
	if _, err := client.call(ctx, "Emulation.setEmulatedMedia", map[string]any{"media": "print"}, attachment.SessionID); err != nil {
		return err
	}
	if _, err := client.call(ctx, "Page.navigate", map[string]any{"url": inputURL}, attachment.SessionID); err != nil {
		return err
	}
	if _, err := client.waitForEvent(ctx, "Page.loadEventFired", attachment.SessionID); err != nil {
		return err
	}
	// Wait for local fonts and two animation frames. This keeps print output
	// deterministic after stylesheet/font loading without depending on network
	// idle heuristics (the document intentionally has a restrictive CSP).
	if _, err := client.call(ctx, "Runtime.evaluate", map[string]any{
		"expression":    "Promise.all([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))]).then(() => true)",
		"awaitPromise":  true,
		"returnByValue": true,
	}, attachment.SessionID); err != nil {
		return err
	}
	printResult, err := client.call(ctx, "Page.printToPDF", map[string]any{
		"landscape":           false,
		"displayHeaderFooter": false,
		"printBackground":     true,
		"preferCSSPageSize":   true,
		"paperWidth":          8.2677165354,
		"paperHeight":         11.6929133858,
		"marginTop":           0,
		"marginBottom":        0,
		"marginLeft":          0,
		"marginRight":         0,
	}, attachment.SessionID)
	if err != nil {
		return err
	}
	var printable struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(printResult, &printable); err != nil || printable.Data == "" {
		return errors.New("browser did not return PDF data")
	}
	pdfData, err := base64.StdEncoding.DecodeString(printable.Data)
	if err != nil || !bytes.HasPrefix(pdfData, []byte("%PDF")) {
		return errors.New("browser returned invalid PDF data")
	}
	if err := os.WriteFile(outputPDFPath, pdfData, 0600); err != nil {
		return fmt.Errorf("write browser PDF output: %w", err)
	}
	return nil
}
