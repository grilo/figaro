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

const maxIndexedSearchTrigrams = 32768

var markdownBacklinkRE = regexp.MustCompile(`\[([^\]\r\n]*)\]\(([^)\s\r\n]+)\)`)

// vaultIndex is a vault-lock-protected, in-memory description of Markdown
// content. App methods mutate it only while holding vaultMu for writing, so
// readers can share it under vaultMu.RLock without copying the whole vault.
//
// Keeping the original content has a bounded, deliberate cost: queries such
// as search and backlinks no longer reopen every Markdown file. The derived
// Kanban and calendar structures make their common queries independent of the
// number of notes altogether.
type vaultIndex struct {
	files                map[string]vaultIndexedFile
	paths                []string
	tags                 map[string]struct{}
	tagCounts            map[string]int
	cardsByTag           map[string][]KanbanCard
	calendar             *calendarDateIndex
	dailyNoteCounts      map[string]int
	linkedDayCounts      map[string]int
	searchTrigrams       map[string]map[string]struct{}
	searchUnindexedFiles map[string]struct{}
	backlinksByTarget    map[string][]BacklinkResult
}

type vaultIndexedFile struct {
	path           string
	name           string
	mtime          float64
	content        string
	searchLower    string
	searchTrigrams []string
	searchIndexed  bool
	tags           []string
	cards          []KanbanCard
	dailyNote      string
	linkedDays     []string
	linked         map[string]LinkedNote
	backlinks      map[string]BacklinkResult
}

func newVaultIndex() *vaultIndex {
	return &vaultIndex{
		files:                make(map[string]vaultIndexedFile),
		searchTrigrams:       make(map[string]map[string]struct{}),
		searchUnindexedFiles: make(map[string]struct{}),
		backlinksByTarget:    make(map[string][]BacklinkResult),
	}
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
		path:        filepath.ToSlash(rel),
		name:        info.Name(),
		mtime:       indexMtime(info),
		content:     content,
		searchLower: strings.ToLower(content),
		tags:        findHashtags(content),
		linked:      make(map[string]LinkedNote),
		backlinks:   make(map[string]BacklinkResult),
	}
	file.searchTrigrams, file.searchIndexed = collectSearchTrigrams(file.searchLower, maxIndexedSearchTrigrams)

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

	for lineNumber, line := range strings.Split(content, "\n") {
		for _, match := range markdownBacklinkRE.FindAllStringSubmatch(line, -1) {
			label, target := match[1], match[2]
			targetName := strings.TrimSuffix(filepath.Base(target), ".md")
			if !strings.HasSuffix(strings.ToLower(target), ".md") || !strings.EqualFold(label, targetName) {
				continue
			}
			key := strings.ToLower(target)
			if _, seen := file.backlinks[key]; !seen {
				file.backlinks[key] = BacklinkResult{
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

// collectSearchTrigrams returns each unique three-byte substring in content.
// A capped index keeps a single generated or minified note from consuming an
// unbounded amount of memory; such a note remains in the search fallback set
// and is still checked for every query.
func collectSearchTrigrams(content string, limit int) ([]string, bool) {
	if len(content) < 3 {
		return nil, true
	}
	unique := make(map[string]struct{})
	for offset := 0; offset <= len(content)-3; offset++ {
		unique[content[offset:offset+3]] = struct{}{}
		if len(unique) > limit {
			return nil, false
		}
	}
	trigrams := make([]string, 0, len(unique))
	for trigram := range unique {
		trigrams = append(trigrams, trigram)
	}
	sort.Strings(trigrams)
	return trigrams, true
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
	index.tagCounts = make(map[string]int)
	index.dailyNoteCounts = make(map[string]int)
	index.linkedDayCounts = make(map[string]int)
	index.searchTrigrams = make(map[string]map[string]struct{})
	index.searchUnindexedFiles = make(map[string]struct{})
	index.backlinksByTarget = make(map[string][]BacklinkResult)
	for _, path := range index.paths {
		index.addFileContributions(index.files[path])
	}
	index.sortAllCards()
	index.sortAllLinkedNotes()
	index.sortAllBacklinks()
}

func (index *vaultIndex) addFileContributions(file vaultIndexedFile) {
	for _, tag := range file.tags {
		index.tagCounts[tag]++
		index.tags[tag] = struct{}{}
	}
	for _, card := range file.cards {
		index.cardsByTag[card.Tag] = append(index.cardsByTag[card.Tag], card)
	}
	if file.dailyNote != "" {
		index.dailyNoteCounts[file.dailyNote]++
		index.calendar.dailyNotes[file.dailyNote] = struct{}{}
	}
	for _, dateStr := range file.linkedDays {
		index.linkedDayCounts[dateStr]++
		index.calendar.linkedDays[dateStr] = struct{}{}
	}
	for dateStr, note := range file.linked {
		index.calendar.linkedNotes[dateStr] = append(index.calendar.linkedNotes[dateStr], note)
	}
	if file.searchIndexed {
		for _, trigram := range file.searchTrigrams {
			postings := index.searchTrigrams[trigram]
			if postings == nil {
				postings = make(map[string]struct{})
				index.searchTrigrams[trigram] = postings
			}
			postings[file.path] = struct{}{}
		}
	} else {
		index.searchUnindexedFiles[file.path] = struct{}{}
	}
	for target, backlink := range file.backlinks {
		index.backlinksByTarget[target] = append(index.backlinksByTarget[target], backlink)
	}
}

func (index *vaultIndex) removeFileContributions(file vaultIndexedFile) {
	for _, tag := range file.tags {
		if index.tagCounts[tag] <= 1 {
			delete(index.tagCounts, tag)
			delete(index.tags, tag)
		} else {
			index.tagCounts[tag]--
		}
	}
	cardTags := make(map[string]struct{})
	for _, card := range file.cards {
		cardTags[card.Tag] = struct{}{}
	}
	for tag := range cardTags {
		cards := index.cardsByTag[tag]
		filtered := cards[:0]
		for _, existing := range cards {
			if existing.File != file.path {
				filtered = append(filtered, existing)
			}
		}
		if len(filtered) == 0 {
			delete(index.cardsByTag, tag)
		} else {
			index.cardsByTag[tag] = filtered
		}
	}
	if file.dailyNote != "" {
		if index.dailyNoteCounts[file.dailyNote] <= 1 {
			delete(index.dailyNoteCounts, file.dailyNote)
			delete(index.calendar.dailyNotes, file.dailyNote)
		} else {
			index.dailyNoteCounts[file.dailyNote]--
		}
	}
	for _, dateStr := range file.linkedDays {
		if index.linkedDayCounts[dateStr] <= 1 {
			delete(index.linkedDayCounts, dateStr)
			delete(index.calendar.linkedDays, dateStr)
		} else {
			index.linkedDayCounts[dateStr]--
		}
	}
	for dateStr := range file.linked {
		notes := index.calendar.linkedNotes[dateStr]
		filtered := notes[:0]
		for _, note := range notes {
			if note.Path != file.path {
				filtered = append(filtered, note)
			}
		}
		if len(filtered) == 0 {
			delete(index.calendar.linkedNotes, dateStr)
		} else {
			index.calendar.linkedNotes[dateStr] = filtered
		}
	}
	if file.searchIndexed {
		for _, trigram := range file.searchTrigrams {
			postings := index.searchTrigrams[trigram]
			delete(postings, file.path)
			if len(postings) == 0 {
				delete(index.searchTrigrams, trigram)
			}
		}
	} else {
		delete(index.searchUnindexedFiles, file.path)
	}
	for target := range file.backlinks {
		backlinks := index.backlinksByTarget[target]
		filtered := backlinks[:0]
		for _, backlink := range backlinks {
			if backlink.Path != file.path {
				filtered = append(filtered, backlink)
			}
		}
		if len(filtered) == 0 {
			delete(index.backlinksByTarget, target)
		} else {
			index.backlinksByTarget[target] = filtered
		}
	}
}

func sortKanbanCards(cards []KanbanCard) {
	sort.Slice(cards, func(i, j int) bool {
		if cards[i].File != cards[j].File {
			return cards[i].File < cards[j].File
		}
		if cards[i].Line != cards[j].Line {
			return cards[i].Line < cards[j].Line
		}
		return cards[i].Text < cards[j].Text
	})
}

func sortLinkedNotes(notes []LinkedNote) {
	sort.Slice(notes, func(i, j int) bool {
		return notes[i].Mtime > notes[j].Mtime
	})
}

func sortBacklinks(backlinks []BacklinkResult) {
	sort.Slice(backlinks, func(i, j int) bool {
		return backlinks[i].Mtime > backlinks[j].Mtime
	})
}

func (index *vaultIndex) sortAllCards() {
	for _, cards := range index.cardsByTag {
		sortKanbanCards(cards)
	}
}

func (index *vaultIndex) sortAllLinkedNotes() {
	for dateStr := range index.calendar.linkedNotes {
		sortLinkedNotes(index.calendar.linkedNotes[dateStr])
	}
}

func (index *vaultIndex) sortAllBacklinks() {
	for target := range index.backlinksByTarget {
		sortBacklinks(index.backlinksByTarget[target])
	}
}

func (index *vaultIndex) replaceFile(file vaultIndexedFile) {
	if existing, found := index.files[file.path]; found {
		index.removeFileContributions(existing)
		index.removePath(file.path)
	}
	index.files[file.path] = file
	index.insertPath(file.path)
	index.addFileContributions(file)
	for _, tag := range file.tags {
		sortKanbanCards(index.cardsByTag[tag])
	}
	for dateStr := range file.linked {
		sortLinkedNotes(index.calendar.linkedNotes[dateStr])
	}
	for target := range file.backlinks {
		sortBacklinks(index.backlinksByTarget[target])
	}
}

// searchCandidates returns the files that might contain a case-insensitive
// query. Every candidate is verified by SearchFiles, so trigram collisions do
// not change substring-search results.
func (index *vaultIndex) searchCandidates(foldedQuery string) map[string]struct{} {
	candidates := make(map[string]struct{}, len(index.searchUnindexedFiles))
	for path := range index.searchUnindexedFiles {
		candidates[path] = struct{}{}
	}
	queryTrigrams, queryIndexed := collectSearchTrigrams(foldedQuery, maxIndexedSearchTrigrams)
	if !queryIndexed || len(queryTrigrams) == 0 {
		for _, path := range index.paths {
			candidates[path] = struct{}{}
		}
		return candidates
	}

	var smallest map[string]struct{}
	for _, trigram := range queryTrigrams {
		postings := index.searchTrigrams[trigram]
		if len(postings) == 0 {
			return candidates
		}
		if smallest == nil || len(postings) < len(smallest) {
			smallest = postings
		}
	}
	for path := range smallest {
		matchesAll := true
		for _, trigram := range queryTrigrams {
			if _, found := index.searchTrigrams[trigram][path]; !found {
				matchesAll = false
				break
			}
		}
		if matchesAll {
			candidates[path] = struct{}{}
		}
	}
	return candidates
}

func (index *vaultIndex) removeFile(path string) {
	file, found := index.files[path]
	if !found {
		return
	}
	index.removeFileContributions(file)
	delete(index.files, path)
	index.removePath(path)
}

func (index *vaultIndex) insertPath(path string) {
	position := sort.SearchStrings(index.paths, path)
	if position < len(index.paths) && index.paths[position] == path {
		return
	}
	index.paths = append(index.paths, "")
	copy(index.paths[position+1:], index.paths[position:])
	index.paths[position] = path
}

func (index *vaultIndex) removePath(path string) {
	position := sort.SearchStrings(index.paths, path)
	if position >= len(index.paths) || index.paths[position] != path {
		return
	}
	copy(index.paths[position:], index.paths[position+1:])
	index.paths[len(index.paths)-1] = ""
	index.paths = index.paths[:len(index.paths)-1]
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
	a.vaultIndex.replaceFile(file)
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
			a.vaultIndex.removeFile(indexedPath)
		}
	}
	a.publishVaultIndexLocked(a.vaultIndex)
}

func (a *App) invalidateVaultIndexLocked() {
	a.vaultIndex = nil
	a.invalidateCalendarIndexLocked()
}
