// Adapted from Vale v3.20.0. Only bundled local actions are available.
package check

import (
	"errors"
	"fmt"
	"github.com/vale-cli/vale/v3/internal/core"
	"regexp"
	"strconv"
	"strings"
)

func FixAlert(a core.Alert, cfg *core.Config) ([]string, error) {
	switch a.Action.Name {
	case "replace":
		return replace(a, cfg)
	case "remove":
		return remove(a, cfg)
	case "edit":
		return edit(a, cfg)
	}
	return nil, fmt.Errorf("unsupported embedded action: %s", a.Action.Name)
}
func replace(alert core.Alert, _ *core.Config) ([]string, error) {
	return alert.Action.Params, nil
}

func remove(_ core.Alert, _ *core.Config) ([]string, error) {
	return []string{""}, nil
}

func edit(alert core.Alert, _ *core.Config) ([]string, error) {
	match := alert.Match

	if len(alert.Action.Params) == 0 {
		return []string{}, errors.New("no parameters")
	}

	switch name := alert.Action.Params[0]; name {
	case "regex":
		if len(alert.Action.Params) != 3 {
			return []string{}, errors.New("invalid number of parameters")
		}

		regex, err := regexp.Compile(alert.Action.Params[1])
		if err != nil {
			return []string{}, err
		}

		match = regex.ReplaceAllString(match, alert.Action.Params[2])
	case "trim_right":
		if len(alert.Action.Params) != 2 {
			return []string{}, errors.New("invalid number of parameters")
		}
		match = strings.TrimRight(match, alert.Action.Params[1])
	case "trim_left":
		if len(alert.Action.Params) != 2 {
			return []string{}, errors.New("invalid number of parameters")
		}
		match = strings.TrimLeft(match, alert.Action.Params[1])
	case "trim":
		if len(alert.Action.Params) != 2 {
			return []string{}, errors.New("invalid number of parameters")
		}
		match = strings.Trim(match, alert.Action.Params[1])
	case "truncate":
		if len(alert.Action.Params) != 2 {
			return []string{}, errors.New("invalid number of parameters")
		}
		match = strings.Split(match, alert.Action.Params[1])[0]
	case "split":
		if len(alert.Action.Params) != 3 {
			return []string{}, errors.New("invalid number of parameters")
		}

		index, err := strconv.Atoi(alert.Action.Params[2])
		if err != nil {
			return []string{}, err
		}

		parts := strings.Split(match, alert.Action.Params[1])
		if index >= len(parts) {
			return []string{}, errors.New("index out of range")
		}

		match = parts[index]
	}

	return []string{strings.TrimSpace(match)}, nil
}
