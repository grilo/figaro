package main

import "os/exec"

// startAndReap starts a desktop launcher without blocking the UI, while still
// reaping the short-lived launcher process once it exits.
func startAndReap(command *exec.Cmd) error {
	if err := command.Start(); err != nil {
		return err
	}
	go func() { _ = command.Wait() }()
	return nil
}
