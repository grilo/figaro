package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// vaultIndex is a vault-lock-protected, in-memory description of Markdown
// content. App methods mutate it only while holding vaultMu for writing, so
// readers can share it under vaultMu.RLock without copying the whole vault.
//
// Keeping the original content has a bounded, deliberate cost: queries such
// as search and backlinks no longer reopen every Markdown file. The derived
// Kanban and calendar structures make their common queries independent of the
// number of notes altogether.
type vaultIndex struct {
	files      map[string]vaultIndexedFile
	paths      []string
	tags       map[string]struct{}
	cardsByTag map[string][]KanbanCard
	calendar   *calendarDateIndex
}

type vaultIndexedFile struct {
	path       string
	name       string
	mtime      float64
	content    string
	tags       []string
	cards      []KanbanCard
	dailyNote  string
	linkedDays []string
	linked     map[string]LinkedNote
}

func newVaultIndex() *vaultIndex {
	return &vaultIndex{files: make(map[string]vaultIndexedFile)}
}

func indexMtime(info fs.FileInfo) float64 {
	if info == nil {
		return 0
	}
	return float64(info.ModTime().UnixNano()) / 1e9
}

func indexMarkdownFile(rel string, info fs.FileInfo, data []byte) vaultIndexedFile {
	content := string(data)
	file := vaultIndexedFile{
		path:    filepath.ToSlash(rel),
		name:    info.Name(),
		mtime:   indexMtime(info),
		content: content,
		tags:    findHashtags(content),
		linked:  make(map[string]LinkedNote),
	}

	if matches := dailyNoteFilenameRE.FindStringSubmatch(file.name); len(matches) == 2 && isCalendarDate(matches[1]) {
		file.dailyNote = matches[1]
	}

	seenLinkedDays := make(map[string]struct{})
	for lineNumber, line := range strings.Split(content, "\n") {
		for _, match := range dateMarkdownLinkRE.FindAllStringSubmatch(line, -1) {
			dateStr := match[1]
			if !isCalendarDate(dateStr) {
				continue
			}
			if _, seen := seenLinkedDays[dateStr]; !seen {
				seenLinkedDays[dateStr] = struct{}{}
				file.linked[dateStr] = LinkedNote{
					Path:    file.path,
					Name:    file.name,
					LineNum: lineNumber + 1,
					Snippet: strings.TrimSpace(line),
					Mtime:   file.mtime,
				}
			}
		}
	}
	for _, match := range emptyDateLinkRE.FindAllStringSubmatch(content, -1) {
		if isCalendarDate(match[1]) {
			seenLinkedDays[match[1]] = struct{}{}
		}
	}
	file.linkedDays = make([]string, 0, len(seenLinkedDays))
	for dateStr := range seenLinkedDays {
		file.linkedDays = append(file.linkedDays, dateStr)
	}
	sort.Strings(file.linkedDays)

	for lineNumber, line := range strings.Split(content, "\n") {
		for _, match := range hashtagRe.FindAllStringSubmatchIndex(line, -1) {
			if len(match) < 4 || !isHashtagBoundaryOK(line, match[0], match[1]) {
				continue
			}
			tag := strings.ToLower(line[match[2]:match[3]])
			if hexColorRe.MatchString(tag) {
				continue
			}
			display := strings.TrimSpace(line)
			display = regexpListTaskPrefix.ReplaceAllString(display, "")
			display = removeHashtag(display, tag)
			file.cards = append(file.cards, KanbanCard{
				File:     file.path,
				FileName: file.name,
				Line:     lineNumber + 1,
				Text:     display,
				Tag:      tag,
			})
		}
	}

	return file
}

var regexpListTaskPrefix = regexp.MustCompile(`^[-*+]\s*\[[ x]\]\s*`)

func (index *vaultIndex) rebuildDerived() {
	index.paths = index.paths[:0]
	for path := range index.files {
		index.paths = append(index.paths, path)
	}
	sort.Strings(index.paths)

	index.tags = make(map[string]struct{})
	index.cardsByTag = make(map[string][]KanbanCard)
	index.calendar = newCalendarDateIndex()
	for _, path := range index.paths {
		file := index.files[path]
		for _, tag := range file.tags {
			index.tags[tag] = struct{}{}
		}
		for _, card := range file.cards {
			index.cardsByTag[card.Tag] = append(index.cardsByTag[card.Tag], card)
		}
		if file.dailyNote != "" {
			index.calendar.dailyNotes[file.dailyNote] = struct{}{}
		}
		for _, dateStr := range file.linkedDays {
			index.calendar.linkedDays[dateStr] = struct{}{}
		}
		for dateStr, note := range file.linked {
			index.calendar.linkedNotes[dateStr] = append(index.calendar.linkedNotes[dateStr], note)
		}
	}
	for dateStr := range index.calendar.linkedNotes {
		sort.Slice(index.calendar.linkedNotes[dateStr], func(i, j int) bool {
			return index.calendar.linkedNotes[dateStr][i].Mtime > index.calendar.linkedNotes[dateStr][j].Mtime
		})
	}
}

func (index *vaultIndex) columns() []string {
	custom := make([]string, 0, len(index.tags))
	for tag := range index.tags {
		isSystem := false
		for _, system := range SystemColumns {
			if tag == system {
				isSystem = true
				break
			}
		}
		if !isSystem {
			custom = append(custom, tag)
		}
	}
	sort.Strings(custom)
	return append(custom, SystemColumns...)
}

// ensureVaultIndexLocked returns the current snapshot, building it at most
// once for concurrent readers. The caller must hold vaultMu for reading or
// writing, which prevents a published snapshot from changing underneath it.
func (a *App) ensureVaultIndexLocked() (*vaultIndex, error) {
	if a.vaultIndex != nil {
		return a.vaultIndex, nil
	}

	a.vaultIndexBuildMu.Lock()
	defer a.vaultIndexBuildMu.Unlock()
	if a.vaultIndex != nil {
		return a.vaultIndex, nil
	}

	index := newVaultIndex()
	if err := a.walkVaultMarkdown(func(_ *os.Root, rel string, info fs.FileInfo, data []byte) error {
		file := indexMarkdownFile(rel, info, data)
		index.files[file.path] = file
		return nil
	}); err != nil {
		return nil, fmt.Errorf("index vault Markdown: %w", err)
	}
	index.rebuildDerived()
	a.publishVaultIndexLocked(index)
	return index, nil
}

func (a *App) publishVaultIndexLocked(index *vaultIndex) {
	a.vaultIndex = index
	a.mu.Lock()
	a.kanbanColumns = index.columns()
	a.mu.Unlock()
	a.calendarMu.Lock()
	a.calendarIndex = index.calendar
	a.calendarMu.Unlock()
}

// updateVaultIndexFileLocked performs the common fast path: a single known
// Markdown file was saved by Figaro. It never reopens unrelated notes.
func (a *App) updateVaultIndexFileLocked(rel string, info fs.FileInfo, content string) {
	if a.vaultIndex == nil {
		a.invalidateCalendarIndexLocked()
		return
	}
	if !strings.HasSuffix(strings.ToLower(rel), ".md") {
		return
	}
	file := indexMarkdownFile(rel, info, []byte(content))
	a.vaultIndex.files[file.path] = file
	a.vaultIndex.rebuildDerived()
	a.publishVaultIndexLocked(a.vaultIndex)
}

func (a *App) removeVaultIndexPathLocked(rel string) {
	if a.vaultIndex == nil {
		a.invalidateCalendarIndexLocked()
		return
	}
	path := filepath.ToSlash(rel)
	for indexedPath := range a.vaultIndex.files {
		if indexedPath == path || strings.HasPrefix(indexedPath, path+"/") {
			delete(a.vaultIndex.files, indexedPath)
		}
	}
	a.vaultIndex.rebuildDerived()
	a.publishVaultIndexLocked(a.vaultIndex)
}

func (a *App) invalidateVaultIndexLocked() {
	a.vaultIndex = nil
	a.invalidateCalendarIndexLocked()
}
