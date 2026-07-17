package main

import (
	"context"
	"embed"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Embed every frontend asset that is present at build time. Generated browser
// modules and icon variants are prepared by the Makefile before desktop builds.
//
//go:embed all:frontend
var assets embed.FS

func main() {
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

	err := wails.Run(&options.App{
		Title:            "figaro",
		Width:            windowState.Width,
		Height:           windowState.Height,
		MinWidth:         minimumWindowWidth,
		MinHeight:        minimumWindowHeight,
		WindowStartState: windowStartState,
		// Frameless for native custom title bar
		Frameless: true,
		// AssetServer serves embedded frontend files
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: vaultHandler,
		},
		// Native window canvas — matches sidebar bg, blends with rounded corners
		BackgroundColour: &options.RGBA{R: 21, G: 21, B: 21, A: 255},
		DragAndDrop: &options.DragAndDrop{
			// Resolve native paths from Explorer, Nautilus, and Finder. The
			// frontend accepts drops only on the file tree and the backend copies
			// them under the root-scoped vault filesystem.
			EnableFileDrop: true,
		},
		// Bind the App struct so all exported methods become JS-callable
		Bind: []interface{}{
			app,
		},
		// Lifecycle hooks
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)
		},
		OnDomReady: func(ctx context.Context) {
			app.domReady(ctx)
		},
		OnShutdown: func(ctx context.Context) {
			app.shutdown(ctx)
		},
		// Platform-specific window options for frameless drag support
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
			// Match the .desktop entry's StartupWMClass and explicitly provide
			// the PNG GTK uses for the running window/dock icon. Without Icon,
			// Wails falls back to the generic GTK application glyph.
			Icon:        linuxWindowIcon,
			ProgramName: "figaro",
		},
	})

	if err != nil {
		log.Fatal(err)
	}
}

func configureWebKitInspector() string {
	enabled := strings.TrimSpace(strings.ToLower(os.Getenv("FIGARO_WEBKIT_INSPECTOR")))
	if enabled != "1" && enabled != "true" && enabled != "yes" {
		// Do not inherit an inspector endpoint from a developer shell into a
		// normal application launch. Production is opt-in even when the parent
		// process happened to have WEBKIT_INSPECTOR_SERVER set.
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
	// background. The theme-aware window outline itself lives in styles.css so
	// browser and packaged-webview rendering share one tested implementation.
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
			// Native startup imports the app only after Wails has completed DOM
			// readiness. Browser development uses bootstrap.js from index.html.
			function reportStartupError(error) {
				window._appInitError = String(error && (error.stack || error.message) || error);
				console.error('Figaro startup failed:', error);
				var status = document.getElementById('status-text');
				if (status) status.textContent = 'Startup failed: ' + (error && error.message || error);
			}
			import('/js/app.js').then(function(module) {
				setTimeout(function() {
					Promise.resolve(module.initApp()).catch(reportStartupError);
				}, 0);
			}).catch(reportStartupError);
		})();
	`)

	// Start auto-commit scheduler (if configured)
	if a.history != nil {
		interval := a.AutoCommitLoad()
		if interval > 0 {
			a.history.StartAutoCommit(interval)
		}
	}
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
