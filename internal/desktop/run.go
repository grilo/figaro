package desktop

import (
	"context"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"

	"figaro/internal/appinfo"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// AssetFS is the bundled application-asset boundary consumed by the desktop
// adapter. embed.FS satisfies it in production, while tests use an ordinary
// directory-backed implementation.
type AssetFS interface {
	fs.FS
	ReadFile(name string) ([]byte, error)
	ReadDir(name string) ([]fs.DirEntry, error)
}

// assets is initialized once by the composition root before any App is
// constructed. Keeping this read-only adapter package-scoped avoids threading
// the same immutable bundle through every existing Wails method.
var assets AssetFS

const figaroSingleInstanceID = "io.github.figaro.Figaro"

func figaroSingleInstanceLock(app *App) *options.SingleInstanceLock {
	return &options.SingleInstanceLock{
		UniqueId: figaroSingleInstanceID,
		OnSecondInstanceLaunch: func(data options.SecondInstanceData) {
			app.handleSecondInstanceLaunch(data.Args, data.WorkingDirectory)
		},
	}
}

// Run assembles and starts the native desktop application.
func Run(bundledAssets AssetFS, wailsConfiguration []byte, launchArgs []string) error {
	if bundledAssets == nil {
		return errors.New("desktop assets are required")
	}
	assets = bundledAssets

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

	app := NewApp(vaultPath)
	applicationVersion, applicationVersionErr := appinfo.ProductVersion(wailsConfiguration)
	if applicationVersionErr != nil {
		log.Printf("[app] Application version is unavailable: %v", applicationVersionErr)
	}
	app.configureApplicationVersion(applicationVersion)
	app.setLaunchExternalFiles(markdownLaunchPaths(launchArgs))
	app.devInspectorAddress = inspectorAddress
	windowState, windowStatePath, windowStateErr := loadMachineWindowState()
	if windowStateErr != nil {
		log.Printf("[window] Using default window state: %v", windowStateErr)
	}
	app.configureWindowState(windowStatePath, windowState)
	machineSettingsPath, machineSettingsErr := currentMachineSettingsPath()
	if machineSettingsErr != nil {
		log.Printf("[settings] Machine-local settings are unavailable: %v", machineSettingsErr)
	} else {
		app.configureMachineSettings(machineSettingsPath)
	}
	windowStartState := options.Normal
	if windowState.Maximized {
		windowStartState = options.Maximised
	}
	// Position is deliberately absent from windowState. Wails centers the
	// initial window on Windows, macOS, and Linux before applying this state.
	linuxWindowIcon, iconErr := assets.ReadFile("frontend/icon-256.png")
	if iconErr != nil {
		// The launcher still has a filesystem-installed icon on Linux; this
		// only affects the native window/dock representation.
		log.Printf("[desktop] Could not load native Linux window icon: %v", iconErr)
	}
	log.Println("App created, launching Wails...")
	vaultHandler := vaultFileHandler(app.vaultPath)
	if closer, ok := vaultHandler.(interface{ Close() error }); ok {
		defer func() {
			if err := closer.Close(); err != nil {
				log.Printf("[vault] Could not close vault HTTP root: %v", err)
			}
		}()
	}

	return wails.Run(&options.App{
		Title:              "Figaro",
		Width:              windowState.Width,
		Height:             windowState.Height,
		MinWidth:           minimumWindowWidth,
		MinHeight:          minimumWindowHeight,
		WindowStartState:   windowStartState,
		SingleInstanceLock: figaroSingleInstanceLock(app),
		// Frameless for native custom title bar.
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: vaultHandler,
		},
		BackgroundColour: &options.RGBA{R: 21, G: 21, B: 21, A: 255},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true,
		},
		Bind: []interface{}{
			app,
		},
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)
		},
		OnDomReady: func(ctx context.Context) {
			app.domReady(ctx)
		},
		OnShutdown: func(ctx context.Context) {
			app.shutdown(ctx)
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
		Linux: &linux.Options{
			Icon:        linuxWindowIcon,
			ProgramName: "figaro",
		},
	})
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
	runtime.WindowExecJS(ctx, `
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
			// bootstrap.js is loaded statically by index.html. It waits for the
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
