//go:build windows

package main

import "golang.org/x/sys/windows"

func openPDFInDefaultViewer(path string) error {
	// ShellExecute uses Windows' file association for .pdf instead of treating
	// it as a URL for the default browser.
	return windows.ShellExecute(0, nil, windows.StringToUTF16Ptr(path), nil, nil, windows.SW_SHOWNORMAL)
}
