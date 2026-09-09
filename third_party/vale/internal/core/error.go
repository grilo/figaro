package core

import "fmt"

// Embedded errors carry rule locations without ANSI formatting or reading host
// files. Rule bodies come from embed.FS; their names are labels, not disk paths.
func NewError(code, title, msg string) error {
	return fmt.Errorf("%s %s: %s", code, title, msg)
}

func NewE100(context string, err error) error {
	return NewError("E100", context, err.Error())
}

func NewE201FromTarget(msg, value, path string) error {
	return fmt.Errorf("E201 %s (%s): %s", path, value, msg)
}

func NewE201FromPosition(msg, path string, line int) error {
	return fmt.Errorf("E201 %s:%d: %s", path, line, msg)
}
