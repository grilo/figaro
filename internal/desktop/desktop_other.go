//go:build !linux

package desktop

// Linux desktop registration uses XDG and GNOME utilities. Wails handles the
// corresponding application integration on macOS and Windows.
func (a *App) ensureDesktopIntegration() {}
