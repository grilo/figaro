package desktop

import (
	"context"
	"errors"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"time"

	"figaro/internal/appinfo"
	"figaro/internal/startup"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// AssetFS is the bundled application-asset boundary consumed by the desktop
// adapter. embed.FS satisfies it in production, while tests use an ordinary
// directory-backed implementation.
type AssetFS interface {
	fs.FS
	ReadFile(name string) ([]byte, error)
	ReadDir(name string) ([]fs.DirEntry, error)
}

func readBundledAsset(bundle AssetFS, name string) ([]byte, error) {
	if bundle == nil {
		return nil, &fs.PathError{Op: "read", Path: name, Err: fs.ErrNotExist}
	}
	return bundle.ReadFile(name)
}

func readBundledAssetDir(bundle AssetFS, name string) ([]fs.DirEntry, error) {
	if bundle == nil {
		return nil, &fs.PathError{Op: "readdir", Path: name, Err: fs.ErrNotExist}
	}
	return bundle.ReadDir(name)
}

const figaroSingleInstanceID = "io.github.figaro.Figaro"

func figaroSingleInstanceLock(app func() *App) *application.SingleInstanceOptions {
	return &application.SingleInstanceOptions{
		UniqueID: figaroSingleInstanceID,
		OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
			if current := app(); current != nil {
				current.handleSecondInstanceLaunch(data.Args, data.WorkingDir)
			}
		},
	}
}

// nativeFilesDroppedEventName carries native file drops to the frontend with
// their viewport coordinates, so the existing tree/editor routing stays in JS.
const nativeFilesDroppedEventName = "native:files-dropped"

type nativeFileDrop struct {
	X     int      `json:"x"`
	Y     int      `json:"y"`
	Paths []string `json:"paths"`
}

// desktopLifecycle forwards Wails service lifecycle hooks to App without
// adding exported lifecycle methods to the bound frontend facade.
type desktopLifecycle struct {
	app *App
}

func (l *desktopLifecycle) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	l.app.startup(ctx)
	return nil
}

func (l *desktopLifecycle) ServiceShutdown() error {
	l.app.shutdown(context.Background())
	return nil
}

// Run assembles and starts the native desktop application.
func Run(bundledAssets AssetFS, wailsConfiguration []byte, launchArgs []string) error {
	if bundledAssets == nil {
		return errors.New("desktop assets are required")
	}
	log.SetFlags(log.Ltime | log.Lshortfile)
	log.Println("figaro starting...")

	// Never expose a development inspector in normal builds. Developers can
	// explicitly opt in with FIGARO_WEBKIT_INSPECTOR=1.
	inspectorAddress := configureWebKitInspector()

	vaultPath := os.Getenv("VAULT_PATH")
	if vaultPath == "" {
		vaultPath = "./vault"
	}
	log.Println("Vault selected")

	applicationVersion, applicationVersionErr := appinfo.ProductVersion(wailsConfiguration)
	if applicationVersionErr != nil {
		log.Printf("[app] Application version is unavailable: %v", applicationVersionErr)
	}
	linuxWindowIcon, iconErr := bundledAssets.ReadFile("frontend/icon-256.png")
	if iconErr != nil {
		// The launcher still has a filesystem-installed icon on Linux; this
		// only affects the native window/dock representation.
		log.Printf("[desktop] Could not load native Linux window icon: %v", iconErr)
	}
	frontendAssets, err := fs.Sub(bundledAssets, "frontend")
	if err != nil {
		return err
	}

	// Create the Wails application before opening the vault. A pending update
	// swaps the binary inside application.New, and a second launch exits there,
	// so neither path should first index the vault or take its locks.
	var app *App
	var vaultHandler http.Handler = http.NotFoundHandler()
	wailsApp := application.New(application.Options{
		Name:           "Figaro",
		Description:    "Local Markdown Knowledge Base",
		Icon:           linuxWindowIcon,
		SingleInstance: figaroSingleInstanceLock(func() *App { return app }),
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(frontendAssets),
			Middleware: application.ChainMiddleware(
				nativeBridgeOriginGuard,
				vaultRouteMiddleware(func() http.Handler { return vaultHandler }),
			),
			DisableLogging: true,
		},
		Linux: application.LinuxOptions{
			ProgramName:   "figaro",
			ApplicationID: figaroSingleInstanceID,
		},
	})

	var trace *startup.Trace
	var logDir string
	if cache, err := os.UserCacheDir(); err == nil {
		logDir = startupLogsDirectory(cache)
		sink := startup.NewSink(func() (io.WriteCloser, error) { return openStartupLog(logDir, applicationVersion, time.Now()) })
		trace = startup.NewTrace(time.Now, sink.Emit)
		trace.Mark("process")
		defer func() {
			trace.Mark("shutdown")
			select {
			case <-sink.Close():
			case <-time.After(100 * time.Millisecond):
			}
		}()
	}
	app = openApp(vaultPath, trace, bundledAssets)
	app.startupLogDir = logDir
	app.configureApplicationVersion(applicationVersion)
	app.setLaunchExternalFiles(markdownLaunchPaths(launchArgs))
	app.devInspectorAddress = inspectorAddress
	windowState, windowStatePath, windowStateErr := loadMachineWindowState()
	if windowStateErr != nil {
		log.Printf("[window] Using default window state: %v", windowStateErr)
	}
	app.configureWindowState(windowStatePath, windowState)
	if stateRoot, stateErr := machineLocalConfigRoot(); stateErr != nil {
		log.Printf("[session] Keeping workspace state in the vault: %v", stateErr)
	} else {
		app.configureSessionStateRoot(stateRoot)
	}
	machineSettingsPath, machineSettingsErr := currentMachineSettingsPath()
	if machineSettingsErr != nil {
		log.Printf("[settings] Machine-local settings are unavailable: %v", machineSettingsErr)
	} else {
		app.configureMachineSettings(machineSettingsPath)
	}
	windowStartState := application.WindowStateNormal
	if windowState.Maximized {
		windowStartState = application.WindowStateMaximised
	}
	log.Println("App created, launching Wails...")
	vaultHandler = vaultFileHandler(app.vaultPath)
	if closer, ok := vaultHandler.(interface{ Close() error }); ok {
		defer func() {
			if err := closer.Close(); err != nil {
				log.Printf("[vault] Could not close vault HTTP root: %v", err)
			}
		}()
	}

	wailsApp.RegisterService(application.NewService(app))
	wailsApp.RegisterService(application.NewService(&desktopLifecycle{app: app}))

	// Position is deliberately absent from windowState. Wails centers the
	// initial window on Windows, macOS, and Linux before applying this state.
	window := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "Figaro",
		Width:            windowState.Width,
		Height:           windowState.Height,
		MinWidth:         minimumWindowWidth,
		MinHeight:        minimumWindowHeight,
		StartState:       windowStartState,
		Frameless:        true,
		BackgroundColour: application.NewRGBA(21, 21, 21, 255),
		EnableFileDrop:   true,
		DevToolsEnabled:  inspectorAddress != "",
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBarHiddenInset,
		},
		Linux: application.LinuxWindow{
			Icon: linuxWindowIcon,
		},
	})
	app.windowRuntime = wailsWindowRuntime{app: wailsApp, window: window}
	app.desktopRuntime.attachNative(showWailsWindow(window), func(name string, data ...any) {
		wailsApp.Event.Emit(name, data...)
	})
	window.OnWindowEvent(events.Common.WindowRuntimeReady, func(*application.WindowEvent) {
		app.domReady(context.Background())
		app.scheduleStartupUpdateCheck()
	})
	window.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		drop := nativeFileDrop{Paths: event.Context().DroppedFiles()}
		if details := event.Context().DropTargetDetails(); details != nil {
			drop.X, drop.Y = details.X, details.Y
		}
		app.emitRuntimeEventData(nativeFilesDroppedEventName, drop)
	})
	app.configureUpdater(wailsApp, applicationVersion)

	trace.Mark("webview-launch")
	return wailsApp.Run()
}

// markdownLaunchPaths accepts only existing Markdown files provided as native
// launch arguments. Desktop launchers can add their own flags, which are not
// documents and must not become editor tabs.
func markdownLaunchPaths(args []string) []string {
	workingDirectory, _ := os.Getwd()
	return markdownLaunchPathsFrom(args, workingDirectory)
}

// markdownLaunchPathsFrom resolves the second process's relative arguments
// against its own working directory, not the already-running process's. Wails
// supplies that directory with every forwarded launch.
func markdownLaunchPathsFrom(args []string, workingDirectory string) []string {
	base := strings.TrimSpace(workingDirectory)
	if base == "" {
		base, _ = os.Getwd()
	}
	if base != "" && !filepath.IsAbs(base) {
		if absoluteBase, err := filepath.Abs(base); err == nil {
			base = absoluteBase
		}
	}
	paths := make([]string, 0, len(args))
	seen := make(map[string]struct{})
	for _, arg := range args {
		if arg == "" || strings.HasPrefix(arg, "-") || !strings.EqualFold(filepath.Ext(arg), ".md") {
			continue
		}
		path := arg
		if !filepath.IsAbs(path) {
			path = filepath.Join(base, path)
		}
		path, err := filepath.Abs(path)
		if err != nil {
			continue
		}
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		key := path
		if goruntime.GOOS == "windows" {
			key = strings.ToLower(key)
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		paths = append(paths, path)
	}
	return paths
}

func configureWebKitInspector() string {
	enabled := strings.TrimSpace(strings.ToLower(os.Getenv("FIGARO_WEBKIT_INSPECTOR")))
	if enabled != "1" && enabled != "true" && enabled != "yes" {
		if err := os.Unsetenv("WEBKIT_INSPECTOR_SERVER"); err != nil {
			log.Printf("[devtools] Could not disable inherited WebKit inspector: %v", err)
		}
		return ""
	}

	const address = "127.0.0.1:29222"
	if err := os.Setenv("WEBKIT_INSPECTOR_SERVER", address); err != nil {
		log.Printf("[devtools] Could not enable WebKit inspector: %v", err)
		return ""
	}
	log.Printf("[devtools] WebKit inspector enabled at http://%s", address)
	return address
}

// domReady is called after the frontend has loaded.
func (a *App) domReady(ctx context.Context) {
	a.startupTrace.Mark("dom-ready")
	// Keep the native canvas dark if a webview briefly exposes the document
	// background. The theme-aware window outline itself lives in the eager
	// base stylesheet so browser and packaged-webview rendering share one
	// tested implementation.
	css := `
		html, body {
			background: #151515;
		}
	`
	inspectorLog := ""
	if a.devInspectorAddress != "" {
		inspectorLog = `console.log('🔧 DevTools: open http://` + a.devInspectorAddress + ` in browser');`
	}
	a.windowRuntime.ExecJS(ctx, `
		(function() {
			var s = document.createElement('style');
			s.id = 'wails-frameless-border';
			s.textContent = `+"`"+css+"`"+`;
			document.head.appendChild(s);
			`+inspectorLog+`
			if (typeof Intl !== 'undefined' && Intl.Segmenter) {
				Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true });
			}
			try {
				if (typeof Intl !== 'undefined' && Intl.Collator) {
					new Intl.Collator(navigator.language);
				}
			} catch (_) {
				Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
			}
			// The generated application bundle is loaded statically by index.html.
			// Its bootstrap waits for the
			// Wails binding and owns the single application-startup path.
		})();
	`)
}

// vaultFileServer holds an os.Root open for the lifetime of Wails' local asset
// server. Unlike http.Dir, it cannot be raced through a vault symlink into an
// arbitrary location outside the chosen vault.
type vaultFileServer struct {
	root    *os.Root
	handler http.Handler
}

func (s *vaultFileServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

func (s *vaultFileServer) Close() error {
	return s.root.Close()
}

// vaultFileHandler returns an http.Handler that serves files from the vault
// directory under the /vault/ URL prefix. The root stays open so a rename of
// the vault itself cannot change the directory being served mid-session.
func vaultFileHandler(vaultPath string) http.Handler {
	root, err := os.OpenRoot(vaultPath)
	if err != nil {
		log.Printf("[vault] Cannot open HTTP vault root: %v", err)
		return http.NotFoundHandler()
	}
	return &vaultFileServer{
		root:    root,
		handler: http.StripPrefix("/vault/", http.FileServerFS(root.FS())),
	}
}
