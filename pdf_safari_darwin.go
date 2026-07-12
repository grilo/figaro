//go:build darwin && cgo

package main

/*
#cgo CFLAGS: -fblocks -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework WebKit -framework PDFKit
#include <stdlib.h>

int figaro_render_safari_pdf(const char *input_path, const char *output_path, const char *read_access_path, char **error_message);
*/
import "C"

import (
	"context"
	"errors"
	"unsafe"
)

// renderSafariPDF uses the installed Safari/WebKit framework rather than
// attempting to pass unsupported Chromium flags to Safari.app. WKWebView's
// createPDF API produces PDF data without a visible browser window.
func renderSafariPDF(_ context.Context, inputHTML string, outputPDF string, readAccessPath string) error {
	input := C.CString(inputHTML)
	defer C.free(unsafe.Pointer(input))
	output := C.CString(outputPDF)
	defer C.free(unsafe.Pointer(output))
	readAccess := C.CString(readAccessPath)
	defer C.free(unsafe.Pointer(readAccess))

	var message *C.char
	if C.figaro_render_safari_pdf(input, output, readAccess, &message) == 0 {
		if message != nil {
			defer C.free(unsafe.Pointer(message))
			return errors.New(C.GoString(message))
		}
		return errors.New("Safari could not generate the PDF")
	}
	if message != nil {
		C.free(unsafe.Pointer(message))
	}
	return nil
}
