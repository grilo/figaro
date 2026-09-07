package history

import "strings"

// configHistoryIgnorePlan removes only the blanket rule older Figaro versions
// inserted. Explicit user patterns for individual config files remain intact.
func configHistoryIgnorePlan(content string) string {
	lines := strings.SplitAfter(content, "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) != ".config/" {
			kept = append(kept, line)
		}
	}
	return strings.Join(kept, "")
}
