//go:build !windows

package writing

import "os/exec"

func hideProcessWindow(command *exec.Cmd) {}
