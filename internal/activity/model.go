// Package activity derives passage history from immutable text snapshots. It
// owns no Git, filesystem, clock, or editor effects.
package activity

import (
	"strings"
)

// Snapshot is one content-changing revision, supplied oldest first.
type Snapshot struct {
	Revision  string
	Path      string
	Timestamp float64
	Source    string
}

type Line struct {
	Event int `json:"event"`
}

type Event struct {
	Revision  string  `json:"revision"`
	Path      string  `json:"path"`
	Timestamp float64 `json:"timestamp"`
	Kind      string  `json:"kind"`
	Before    string  `json:"before"`
	After     string  `json:"after"`
	Excerpt   bool    `json:"excerpt"`
	Parents   []int   `json:"parents"`
}

type Document struct {
	Revision string  `json:"revision"`
	Source   string  `json:"source"`
	Lines    []Line  `json:"lines"`
	Events   []Event `json:"events"`
	Partial  bool    `json:"partial"`
}

func SplitLines(source string) []string {
	return strings.Split(strings.ReplaceAll(source, "\r\n", "\n"), "\n")
}

// MatchLines maps new lines to unchanged old lines. Stable prefix/suffix and
// unique text anchors preserve prepends and moved passages. Small duplicate
// regions use an exact LCS; large ambiguous regions remain unmatched instead
// of choosing a duplicate elsewhere in the document (-2 means ambiguous).
func MatchLines(before, after []string) []int {
	result := make([]int, len(after))
	for i := range result {
		result[i] = -1
	}
	used := make([]bool, len(before))
	var match func(int, int, int, int)
	match = func(a, b, c, d int) {
		for a < b && c < d && before[a] == after[c] {
			result[c] = a
			used[a] = true
			a++
			c++
		}
		for a < b && c < d && before[b-1] == after[d-1] {
			b--
			d--
			result[d] = b
			used[b] = true
		}
		if a == b || c == d {
			return
		}
		oldCounts := map[string]int{}
		oldPositions := map[string]int{}
		newCounts := map[string]int{}
		for i := a; i < b; i++ {
			oldCounts[before[i]]++
			oldPositions[before[i]] = i
		}
		for i := c; i < d; i++ {
			newCounts[after[i]]++
		}
		// A longest increasing subsequence supplies non-crossing partition anchors.
		type anchor struct{ old, next int }
		anchors := []anchor{}
		tails := []int{}
		predecessors := []int{}
		for i := c; i < d; i++ {
			text := after[i]
			if strings.TrimSpace(text) == "" || oldCounts[text] != 1 || newCounts[text] != 1 {
				continue
			}
			pos := oldPositions[text]
			lo, hi := 0, len(tails)
			for lo < hi {
				mid := (lo + hi) / 2
				if anchors[tails[mid]].old < pos {
					lo = mid + 1
				} else {
					hi = mid
				}
			}
			previous := -1
			if lo > 0 {
				previous = tails[lo-1]
			}
			predecessors = append(predecessors, previous)
			anchors = append(anchors, anchor{pos, i})
			if lo == len(tails) {
				tails = append(tails, len(anchors)-1)
			} else {
				tails[lo] = len(anchors) - 1
			}
		}
		if len(tails) > 0 {
			chain := []anchor{}
			for index := tails[len(tails)-1]; index >= 0; index = predecessors[index] {
				chain = append(chain, anchors[index])
			}
			for i := len(chain) - 1; i >= 0; i-- {
				p := chain[i]
				match(a, p.old, c, p.next)
				result[p.next] = p.old
				used[p.old] = true
				a = p.old + 1
				c = p.next + 1
			}
			match(a, b, c, d)
			return
		}
		if (b-a)*(d-c) > 65536 {
			for i := c; i < d; i++ {
				if oldCounts[after[i]] > 0 {
					result[i] = -2
				}
			}
			return
		}
		width := d - c + 1
		cells := make([]uint32, (b-a+1)*width)
		for i := b - a - 1; i >= 0; i-- {
			for j := d - c - 1; j >= 0; j-- {
				if before[a+i] == after[c+j] {
					cells[i*width+j] = 1 + cells[(i+1)*width+j+1]
				} else {
					cells[i*width+j] = max(cells[(i+1)*width+j], cells[i*width+j+1])
				}
			}
		}
		i, j := 0, 0
		for i < b-a && j < d-c {
			if before[a+i] == after[c+j] {
				result[c+j] = a + i
				used[a+i] = true
				i++
				j++
			} else if cells[(i+1)*width+j] >= cells[i*width+j+1] {
				i++
			} else {
				j++
			}
		}
	}
	match(0, len(before), 0, len(after))
	// Preserve an exact, unique moved line; repeated copies never share identity.
	oldCounts := map[string]int{}
	newCounts := map[string]int{}
	positions := map[string]int{}
	for i, text := range before {
		oldCounts[text]++
		positions[text] = i
	}
	for _, text := range after {
		newCounts[text]++
	}
	for i, text := range after {
		if result[i] < 0 && strings.TrimSpace(text) != "" && oldCounts[text] == 1 && newCounts[text] == 1 && !used[positions[text]] {
			result[i] = positions[text]
			used[positions[text]] = true
		}
	}
	return result
}

func excerpt(lines []string) (string, bool) {
	text := strings.Join(lines, "\n")
	runes := []rune(text)
	if len(runes) > 4000 {
		return string(runes[:4000]), true
	}
	return text, false
}

// Build carries each surviving line's latest event forward. Changed ranges
// retain links to older events so the pane can show a passage's earlier work.
// An incomplete history starts with unknown attribution, never an invented date.
func Build(snapshots []Snapshot, complete bool) Document {
	result := Document{Lines: []Line{}, Events: []Event{}, Partial: !complete}
	previous := []string{}
	for step, snapshot := range snapshots {
		next := SplitLines(snapshot.Source)
		mapping := MatchLines(previous, next)
		lines := make([]Line, len(next))
		for i := range lines {
			lines[i].Event = -1
		}
		for i, old := range mapping {
			if old == -2 {
				result.Partial = true
			}
			if old >= 0 {
				lines[i] = result.Lines[old]
			}
		}
		for i := 0; i < len(next); {
			if mapping[i] >= 0 || mapping[i] == -2 {
				i++
				continue
			}
			start := i
			for i < len(next) && mapping[i] == -1 {
				i++
			}
			// A non-crossing neighboring pair bounds the replaced source. Moved
			// anchors may cross, in which case we make no claim about prior identity.
			oldStart, oldEnd := 0, len(previous)
			if start > 0 {
				oldStart = mapping[start-1] + 1
			}
			if i < len(next) {
				oldEnd = mapping[i]
			}
			if oldStart < 0 || oldEnd < oldStart || oldEnd > len(previous) {
				oldStart = 0
				oldEnd = 0
			}
			if len(result.Events) >= 2048 {
				result.Partial = true
				continue
			}
			if step == 0 && !complete {
				continue
			}
			parents := []int{}
			seen := map[int]bool{}
			for j := oldStart; j < oldEnd; j++ {
				id := result.Lines[j].Event
				if id >= 0 && !seen[id] {
					parents = append(parents, id)
					seen[id] = true
				}
			}
			before, cutBefore := excerpt(previous[oldStart:oldEnd])
			after, cutAfter := excerpt(next[start:i])
			kind := "added"
			if strings.TrimSpace(before) != "" {
				kind = "edited"
			}
			event := Event{Revision: snapshot.Revision, Path: snapshot.Path, Timestamp: snapshot.Timestamp, Kind: kind, Before: before, After: after, Excerpt: cutBefore || cutAfter, Parents: parents}
			id := len(result.Events)
			result.Events = append(result.Events, event)
			for j := start; j < i; j++ {
				lines[j].Event = id
			}
		}
		result.Source = snapshot.Source
		result.Revision = snapshot.Revision
		result.Lines = lines
		previous = next
	}
	return result
}
