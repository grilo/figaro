package desktop

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"figaro/internal/links"
	searchmodel "figaro/internal/search"
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
	files                   map[string]vaultIndexedFile
	paths                   []string
	tags                    map[string]struct{}
	tagCounts               map[string]int
	cardsByTag              map[string][]KanbanCard
	calendar                *calendarDateIndex
	dailyNoteCounts         map[string]int
	linkedDayCounts         map[string]int
	searchTrigrams          map[string][]string
	searchUnindexedFiles    map[string]struct{}
	searchTermPostings      map[string][]string
	searchDocumentFrequency map[string]int
	searchVocabulary        []string
	searchVocabularyReady   bool
	searchFieldLengths      [searchmodel.FieldCount]int
	backlinksByTarget       map[string][]BacklinkResult
}

type vaultIndexedFile struct {
	path           string
	name           string
	mtime          float64
	size           int64
	modTimeNano    int64
	mode           os.FileMode
	content        string
	searchLower    string
	searchTrigrams []string
	searchIndexed  bool
	searchHeadings string
	searchDocument searchmodel.DocumentStats
	linkTargets    []string
	tags           []string
	cards          []KanbanCard
	dailyNote      string
	linkedDays     []string
	noteDays       []string
	linked         map[string]LinkedNote
	noteLinks      map[string]LinkedNote
	backlinks      map[string]BacklinkResult
}

type vaultIndexedText struct {
	content        string
	searchLower    string
	searchTrigrams []string
	searchIndexed  bool
	searchHeadings string
	searchDocument searchmodel.DocumentStats
}

func newVaultIndex() *vaultIndex {
	return &vaultIndex{
		files:                   make(map[string]vaultIndexedFile),
		searchTrigrams:          make(map[string][]string),
		searchUnindexedFiles:    make(map[string]struct{}),
		searchTermPostings:      make(map[string][]string),
		searchDocumentFrequency: make(map[string]int),
		backlinksByTarget:       make(map[string][]BacklinkResult),
	}
}

func indexMtime(info fs.FileInfo) float64 {
	if info == nil {
		return 0
	}
	return float64(info.ModTime().UnixNano()) / 1e9
}

func indexMarkdownFile(rel string, info fs.FileInfo, data []byte) vaultIndexedFile {
	return indexMarkdownText(rel, info, newVaultIndexedText(string(data)))
}

func newVaultIndexedText(content string) vaultIndexedText {
	searchLower := searchmodel.Normalize(content, false)
	searchTrigrams, searchIndexed := collectSearchTrigrams(
		searchLower,
		maxIndexedSearchTrigrams,
	)
	searchHeadings := searchmodel.ExtractMarkdownHeadings(content)
	searchDocument := searchmodel.DocumentStats{}
	searchDocument.Fields[searchmodel.FieldHeadings] = searchmodel.Analyze(searchHeadings, false)
	searchDocument.Fields[searchmodel.FieldBody] = searchmodel.AnalyzeNormalized(searchLower)
	return vaultIndexedText{
		content:        content,
		searchLower:    searchLower,
		searchTrigrams: searchTrigrams,
		searchIndexed:  searchIndexed,
		searchHeadings: searchHeadings,
		searchDocument: searchDocument,
	}
}

func pooledVaultIndexedText(pool map[string]vaultIndexedText, content string) vaultIndexedText {
	if text, found := pool[content]; found {
		return text
	}
	text := newVaultIndexedText(content)
	pool[text.content] = text
	return text
}

func indexMarkdownText(rel string, info fs.FileInfo, text vaultIndexedText) vaultIndexedFile {
	content := text.content
	file := vaultIndexedFile{
		path:           filepath.ToSlash(rel),
		name:           info.Name(),
		mtime:          indexMtime(info),
		size:           info.Size(),
		modTimeNano:    info.ModTime().UnixNano(),
		mode:           info.Mode(),
		content:        content,
		searchLower:    text.searchLower,
		searchTrigrams: text.searchTrigrams,
		searchIndexed:  text.searchIndexed,
		searchHeadings: text.searchHeadings,
		searchDocument: text.searchDocument,
		linked:         make(map[string]LinkedNote),
		noteLinks:      make(map[string]LinkedNote),
		backlinks:      make(map[string]BacklinkResult),
	}
	file.searchDocument.Fields[searchmodel.FieldTitle] = searchmodel.Analyze(
		strings.TrimSuffix(file.name, filepath.Ext(file.name)), false,
	)
	file.searchDocument.Fields[searchmodel.FieldPath] = searchmodel.Analyze(
		strings.TrimSuffix(file.path, filepath.Ext(file.path)), false,
	)
	file.linkTargets = links.MarkdownLinkTargets(content, file.path)
	if matches := dailyNoteFilenameRE.FindStringSubmatch(file.name); len(matches) == 2 && isCalendarDate(matches[1]) {
		file.dailyNote = matches[1]
	}

	seenLinkedDays := make(map[string]struct{})
	seenNoteDays := make(map[string]struct{})
	seenTags := make(map[string]struct{})
	// One line walk feeds every document-derived projection. Indexing runs on
	// initial vault discovery and on each Markdown save, so avoiding separate
	// string splits for dates, backlinks, and cards substantially reduces
	// allocation without changing their parsing rules.
	for lineNumber, lineStart := 1, 0; ; lineNumber++ {
		lineEnd := strings.IndexByte(content[lineStart:], '\n')
		line := content[lineStart:]
		if lineEnd >= 0 {
			line = content[lineStart : lineStart+lineEnd]
		}

		for _, match := range dateMarkdownLinkRE.FindAllStringSubmatch(line, -1) {
			dateStr := match[1]
			if dateStr == "" {
				dateStr = match[2]
			}
			if !isCalendarDate(dateStr) {
				continue
			}
			if _, seen := seenLinkedDays[dateStr]; !seen {
				seenLinkedDays[dateStr] = struct{}{}
				file.linked[dateStr] = LinkedNote{
					Path:    file.path,
					Name:    file.name,
					LineNum: lineNumber,
					Snippet: strings.TrimSpace(line),
					Mtime:   file.mtime,
				}
			}
			{
				seenNoteDays[dateStr] = struct{}{}
				if _, seen := file.noteLinks[dateStr]; !seen {
					file.noteLinks[dateStr] = LinkedNote{
						Path:    file.path,
						Name:    file.name,
						LineNum: lineNumber,
						Snippet: strings.TrimSpace(line),
						Mtime:   file.mtime,
					}
				}
			}
		}
		for _, match := range emptyDateLinkRE.FindAllStringSubmatch(line, -1) {
			if isCalendarDate(match[1]) {
				seenLinkedDays[match[1]] = struct{}{}
			}
		}
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
					LineNum: lineNumber,
					Snippet: strings.TrimSpace(line),
					Mtime:   file.mtime,
				}
			}
		}
		lineTags := make([]string, 0)
		lineTagSet := make(map[string]struct{})
		for _, match := range hashtagRe.FindAllStringSubmatchIndex(line, -1) {
			if len(match) < 4 || !isHashtagBoundaryOK(line, match[0], match[1]) {
				continue
			}
			tag := strings.ToLower(line[match[2]:match[3]])
			if hexColorRe.MatchString(tag) {
				continue
			}
			if _, seen := seenTags[tag]; !seen {
				seenTags[tag] = struct{}{}
				file.tags = append(file.tags, tag)
			}
			if _, seen := lineTagSet[tag]; seen {
				continue
			}
			lineTagSet[tag] = struct{}{}
			lineTags = append(lineTags, tag)
		}

		_, completed := lineTagSet["done"]
		for _, tag := range lineTags {
			display := strings.TrimSpace(line)
			display = regexpListTaskPrefix.ReplaceAllString(display, "")

			display = strings.TrimSpace(removeHashtag(display, tag))
			file.cards = append(file.cards, KanbanCard{
				Source:   line,
				File:     file.path,
				FileName: file.name,
				Line:     lineNumber,
				Text:     display,
				Tag:      tag,

				Completed: completed,
			})
		}

		if lineEnd < 0 {
			break
		}
		lineStart += lineEnd + 1
	}

	file.linkedDays = make([]string, 0, len(seenLinkedDays))
	for dateStr := range seenLinkedDays {
		file.linkedDays = append(file.linkedDays, dateStr)
	}
	sort.Strings(file.linkedDays)
	file.noteDays = make([]string, 0, len(seenNoteDays))
	for dateStr := range seenNoteDays {
		file.noteDays = append(file.noteDays, dateStr)
	}
	sort.Strings(file.noteDays)
	file.searchDocument.Fields[searchmodel.FieldTags] = searchmodel.Analyze(strings.Join(file.tags, " "), false)

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

var indexedSearchFields = []searchmodel.Field{
	searchmodel.FieldTitle,
	searchmodel.FieldHeadings,
	searchmodel.FieldTags,
	searchmodel.FieldPath,
	searchmodel.FieldBody,
}

func (index *vaultIndex) addSearchDocument(file vaultIndexedFile) {
	for fieldIndex := searchmodel.Field(0); fieldIndex < searchmodel.FieldCount; fieldIndex++ {
		index.searchFieldLengths[fieldIndex] += file.searchDocument.Fields[fieldIndex].Length
	}
	newVocabulary := make([]string, 0)
	for _, term := range searchmodel.UniqueTerms(file.searchDocument, indexedSearchFields...) {
		postings, exists := index.searchTermPostings[term]
		index.searchTermPostings[term] = insertSortedPath(postings, file.path)
		index.searchDocumentFrequency[term] = len(index.searchTermPostings[term])
		if !exists && index.searchVocabularyReady {
			newVocabulary = append(newVocabulary, term)
		}
	}
	index.mergeSearchVocabularyTerms(newVocabulary)
}

func (index *vaultIndex) removeSearchDocument(file vaultIndexedFile) {
	for fieldIndex := searchmodel.Field(0); fieldIndex < searchmodel.FieldCount; fieldIndex++ {
		index.searchFieldLengths[fieldIndex] -= file.searchDocument.Fields[fieldIndex].Length
		if index.searchFieldLengths[fieldIndex] < 0 {
			index.searchFieldLengths[fieldIndex] = 0
		}
	}
	removedVocabulary := make([]string, 0)
	for _, term := range searchmodel.UniqueTerms(file.searchDocument, indexedSearchFields...) {
		postings := removeSortedPath(index.searchTermPostings[term], file.path)
		if len(postings) == 0 {
			delete(index.searchTermPostings, term)
			delete(index.searchDocumentFrequency, term)
			if index.searchVocabularyReady {
				removedVocabulary = append(removedVocabulary, term)
			}
			continue
		}
		index.searchTermPostings[term] = postings
		index.searchDocumentFrequency[term] = len(postings)
	}
	index.removeSearchVocabularyTerms(removedVocabulary)
}

func (index *vaultIndex) rebuildSearchVocabulary() {
	index.searchVocabulary = make([]string, 0, len(index.searchTermPostings))
	for term := range index.searchTermPostings {
		index.searchVocabulary = append(index.searchVocabulary, term)
	}
	sort.Strings(index.searchVocabulary)
	index.searchVocabularyReady = true
}

func (index *vaultIndex) mergeSearchVocabularyTerms(additions []string) {
	if !index.searchVocabularyReady || len(additions) == 0 {
		return
	}
	merged := make([]string, 0, len(index.searchVocabulary)+len(additions))
	left, right := 0, 0
	for left < len(index.searchVocabulary) && right < len(additions) {
		if index.searchVocabulary[left] < additions[right] {
			merged = append(merged, index.searchVocabulary[left])
			left++
		} else {
			merged = append(merged, additions[right])
			right++
		}
	}
	merged = append(merged, index.searchVocabulary[left:]...)
	merged = append(merged, additions[right:]...)
	index.searchVocabulary = merged
}

func (index *vaultIndex) removeSearchVocabularyTerms(removals []string) {
	if !index.searchVocabularyReady || len(removals) == 0 {
		return
	}
	retained := index.searchVocabulary[:0]
	removeIndex := 0
	for _, term := range index.searchVocabulary {
		for removeIndex < len(removals) && removals[removeIndex] < term {
			removeIndex++
		}
		if removeIndex < len(removals) && removals[removeIndex] == term {
			removeIndex++
			continue
		}
		retained = append(retained, term)
	}
	clear(index.searchVocabulary[len(retained):])
	index.searchVocabulary = retained
}

func (index *vaultIndex) searchCorpusStats() searchmodel.CorpusStats {
	documentCount := len(index.files)
	stats := searchmodel.CorpusStats{
		DocumentCount:     documentCount,
		DocumentFrequency: index.searchDocumentFrequency,
	}
	for fieldIndex := searchmodel.Field(0); fieldIndex < searchmodel.FieldCount; fieldIndex++ {
		if documentCount > 0 {
			stats.AverageLengths[fieldIndex] = float64(index.searchFieldLengths[fieldIndex]) / float64(documentCount)
		}
	}
	return stats
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
	index.searchTrigrams = make(map[string][]string)
	index.searchUnindexedFiles = make(map[string]struct{})
	index.searchTermPostings = make(map[string][]string)
	index.searchDocumentFrequency = make(map[string]int)
	index.searchVocabulary = nil
	index.searchVocabularyReady = false
	index.searchFieldLengths = [searchmodel.FieldCount]int{}
	index.backlinksByTarget = make(map[string][]BacklinkResult)
	for _, path := range index.paths {
		index.addFileContributions(index.files[path])
	}
	index.sortAllCards()
	index.sortAllLinkedNotes()
	index.sortAllBacklinks()
	index.rebuildSearchVocabulary()
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
		index.calendar.addNotePath(file.dailyNote, file.path)
		snippet := file.content
		if lineEnd := strings.IndexByte(snippet, '\n'); lineEnd >= 0 {
			snippet = snippet[:lineEnd]
		}
		index.calendar.addLinkedNote(file.dailyNote, LinkedNote{
			Path: file.path, Name: file.name, LineNum: 1,
			Snippet: strings.TrimSpace(snippet), Mtime: file.mtime,
		})
		if index.dailyNoteCounts[file.dailyNote] == 0 {
			index.calendar.addDailyNote(file.dailyNote)
		}
		index.dailyNoteCounts[file.dailyNote]++
	}
	for _, dateStr := range file.linkedDays {
		if index.linkedDayCounts[dateStr] == 0 {
			index.calendar.addLinkedDay(dateStr)
		}
		index.linkedDayCounts[dateStr]++
	}
	for _, dateStr := range file.noteDays {
		index.calendar.addNotePath(dateStr, file.path)
	}
	for dateStr, note := range file.noteLinks {
		index.calendar.addLinkedNote(dateStr, note)
	}
	if file.searchIndexed {
		for _, trigram := range file.searchTrigrams {
			index.searchTrigrams[trigram] = insertSortedPath(
				index.searchTrigrams[trigram],
				file.path,
			)
		}
	} else {
		index.searchUnindexedFiles[file.path] = struct{}{}
	}
	index.addSearchDocument(file)
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
		index.calendar.removeNotePath(file.dailyNote, file.path)
		index.calendar.removeLinkedNote(file.dailyNote, file.path)
		if index.dailyNoteCounts[file.dailyNote] <= 1 {
			delete(index.dailyNoteCounts, file.dailyNote)
			index.calendar.removeDailyNote(file.dailyNote)
		} else {
			index.dailyNoteCounts[file.dailyNote]--
		}
	}
	for _, dateStr := range file.linkedDays {
		if index.linkedDayCounts[dateStr] <= 1 {
			delete(index.linkedDayCounts, dateStr)
			index.calendar.removeLinkedDay(dateStr)
		} else {
			index.linkedDayCounts[dateStr]--
		}
	}
	for _, dateStr := range file.noteDays {
		index.calendar.removeNotePath(dateStr, file.path)
	}
	for dateStr := range file.noteLinks {
		index.calendar.removeLinkedNote(dateStr, file.path)
	}
	if file.searchIndexed {
		for _, trigram := range file.searchTrigrams {
			postings := index.searchTrigrams[trigram]
			postings = removeSortedPath(postings, file.path)
			if len(postings) == 0 {
				delete(index.searchTrigrams, trigram)
			} else {
				index.searchTrigrams[trigram] = postings
			}
		}
	} else {
		delete(index.searchUnindexedFiles, file.path)
	}
	index.removeSearchDocument(file)
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
	for dateStr := range file.noteLinks {
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

	var smallest []string
	for _, trigram := range queryTrigrams {
		postings := index.searchTrigrams[trigram]
		if len(postings) == 0 {
			return candidates
		}
		if smallest == nil || len(postings) < len(smallest) {
			smallest = postings
		}
	}
	for _, path := range smallest {
		matchesAll := true
		for _, trigram := range queryTrigrams {
			if !containsSortedPath(index.searchTrigrams[trigram], path) {
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

func insertSortedPath(paths []string, path string) []string {
	position := sort.SearchStrings(paths, path)
	if position < len(paths) && paths[position] == path {
		return paths
	}
	paths = append(paths, "")
	copy(paths[position+1:], paths[position:])
	paths[position] = path
	return paths
}

func removeSortedPath(paths []string, path string) []string {
	position := sort.SearchStrings(paths, path)
	if position >= len(paths) || paths[position] != path {
		return paths
	}
	copy(paths[position:], paths[position+1:])
	paths[len(paths)-1] = ""
	return paths[:len(paths)-1]
}

func containsSortedPath(paths []string, path string) bool {
	position := sort.SearchStrings(paths, path)
	return position < len(paths) && paths[position] == path
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
	a.vaultIndexBuildMu.Lock()
	defer a.vaultIndexBuildMu.Unlock()
	if a.vaultIndex != nil {
		return a.vaultIndex, nil
	}

	generation := a.beginVaultLoad()
	index := newVaultIndex()
	textPool := make(map[string]vaultIndexedText)
	if err := a.walkVaultMarkdownWithProgress(func(_ *os.Root, rel string, info fs.FileInfo, data []byte) error {
		content := string(data)
		text := pooledVaultIndexedText(textPool, content)
		file := indexMarkdownText(rel, info, text)
		index.files[file.path] = file
		return nil
	}, func(loaded int, total int) {
		a.reportVaultLoadProgress(generation, loaded, total)
	}); err != nil {
		indexErr := fmt.Errorf("index vault Markdown: %w", err)
		a.failVaultLoad(generation, indexErr)
		return nil, indexErr
	}
	a.setVaultLoadPhase(generation, VaultLoadFinalizing)
	index.rebuildDerived()
	a.publishVaultIndexLocked(index)
	a.setVaultLoadPhase(generation, VaultLoadReady)
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
	a.updateFileTreeCacheFileLocked(rel, info)
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
	a.removeFileTreeCachePathLocked(rel)
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

// refreshVaultIndexAfterMoveLocked remaps only Markdown files whose source
// path or rewritten content changed, then reconstructs cross-file projections
// from the retained in-memory file records. It performs no unrelated content
// reads; callers fall back to a cold rebuild if any post-move stat fails.
func (a *App) refreshVaultIndexAfterMoveLocked(
	root *os.Root,
	oldRel string,
	newRel string,
	rewrites []vaultLinkRewrite,
) error {
	index := a.vaultIndex
	if index == nil {
		return fmt.Errorf("vault index is unavailable")
	}
	oldRel = links.NormalizeVaultPath(oldRel)
	newRel = links.NormalizeVaultPath(newRel)
	rewritten := make(map[string]string, len(rewrites))
	for _, rewrite := range rewrites {
		rewritten[filepath.ToSlash(rewrite.path)] = string(rewrite.updated)
	}

	oldPaths := append([]string(nil), index.paths...)
	textPool := make(map[string]vaultIndexedText)
	for _, oldPath := range oldPaths {
		file := index.files[oldPath]
		futurePath := links.MovedVaultPath(oldPath, oldRel, newRel)
		updatedContent, contentChanged := rewritten[futurePath]
		if futurePath == oldPath && !contentChanged {
			continue
		}

		text := vaultIndexedText{
			content:        file.content,
			searchLower:    file.searchLower,
			searchTrigrams: file.searchTrigrams,
			searchIndexed:  file.searchIndexed,
			searchHeadings: file.searchHeadings,
			searchDocument: file.searchDocument,
		}
		if contentChanged {
			text = pooledVaultIndexedText(textPool, updatedContent)
		}
		info, err := root.Stat(filepath.FromSlash(futurePath))
		if err != nil {
			return fmt.Errorf("inspect moved Markdown %q: %w", futurePath, err)
		}
		a.updateFileTreeCacheFileLocked(futurePath, info)
		delete(index.files, oldPath)
		index.files[futurePath] = indexMarkdownText(futurePath, info, text)
	}
	index.rebuildDerived()
	a.publishVaultIndexLocked(index)
	return nil
}

// refreshVaultStateAfterCopyLocked walks only the newly copied subtree. It
// retains unrelated file-tree metadata and parses only copied Markdown before
// publishing the existing index. When indexCurrent is false the same walk is
// still used to collect exact watcher acknowledgements; the caller then takes
// the full-rebuild fallback.
func (a *App) refreshVaultStateAfterCopyLocked(
	root *os.Root,
	destination string,
	indexCurrent bool,
) ([]string, error) {
	if indexCurrent && a.vaultIndex == nil {
		return nil, fmt.Errorf("vault index is unavailable")
	}

	copiedPaths := make([]string, 0)
	indexedFiles := make([]vaultIndexedFile, 0)
	textPool := make(map[string]vaultIndexedText)
	walkRoot := filepath.ToSlash(filepath.Clean(destination))
	err := fs.WalkDir(root.FS(), walkRoot, func(rel string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("walk copied vault path %q: %w", rel, walkErr)
		}
		cleanRel := filepath.Clean(filepath.FromSlash(rel))
		copiedPaths = append(copiedPaths, cleanRel)
		info, err := entry.Info()
		if err != nil {
			return fmt.Errorf("inspect copied vault path %q: %w", rel, err)
		}
		a.updateFileTreeCacheFileLocked(cleanRel, info)

		_, visible := visibleFileTreeCachePath(rel)
		if !visible {
			if entry.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if !indexCurrent || entry.IsDir() || !info.Mode().IsRegular() ||
			!strings.EqualFold(filepath.Ext(rel), ".md") {
			return nil
		}
		data, err := root.ReadFile(cleanRel)
		if err != nil {
			return fmt.Errorf("read copied Markdown %q: %w", rel, err)
		}
		text := pooledVaultIndexedText(textPool, string(data))
		indexedFiles = append(indexedFiles, indexMarkdownText(filepath.ToSlash(rel), info, text))
		return nil
	})
	if err != nil {
		return copiedPaths, err
	}
	if indexCurrent {
		for _, file := range indexedFiles {
			a.vaultIndex.replaceFile(file)
		}
		a.publishVaultIndexLocked(a.vaultIndex)
	}
	return copiedPaths, nil
}

func (a *App) invalidateVaultIndexLocked() {
	a.vaultIndex = nil
	a.invalidateCalendarIndexLocked()
}
