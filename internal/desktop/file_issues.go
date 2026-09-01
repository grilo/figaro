package desktop

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"syscall"
	"unicode/utf8"
)

const maxEditableFileBytes int64 = 50 << 20

const (
	fileIssueTooLarge            = "too_large"
	fileIssueBinary              = "binary"
	fileIssueUnsupportedEncoding = "unsupported_encoding"
	fileIssueUnreadable          = "unreadable"
	fileIssueConfigRecovered     = "configuration_recovered"
	fileIssueConfigUnreadable    = "configuration_unreadable"
	fileIssueConfigWriteFailed   = "configuration_write_failed"
	fileIssueHistoryUnavailable  = "history_unavailable"
	fileIssueDiskFull            = "disk_full"
)

// VaultFileIssue describes one vault file Figaro deliberately left untouched.
// The frontend owns presentation and actions; this value records only the
// diagnosis, impact, and recovery guidance established by native inspection.
type VaultFileIssue struct {
	Path     string `json:"path"`
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Title    string `json:"title"`
	Detail   string `json:"detail"`
	Guidance string `json:"guidance"`
	Size     int64  `json:"size,omitempty"`
}

func formatFileIssueSize(size int64) string {
	const megabyte = 1 << 20
	if size < megabyte {
		return fmt.Sprintf("%.1f KB", float64(size)/(1<<10))
	}
	return fmt.Sprintf("%.1f MB", float64(size)/megabyte)
}

// vaultFileMetadataIssue is a pure admission decision made before any file
// contents are allocated. In particular, a sparse or real 1 GB note never
// reaches os.ReadFile merely so the editor can reject it afterward.
func vaultFileMetadataIssue(path string, info fs.FileInfo) *VaultFileIssue {
	if info == nil || info.Size() <= maxEditableFileBytes {
		return nil
	}
	return &VaultFileIssue{
		Path:     path,
		Code:     fileIssueTooLarge,
		Severity: "warning",
		Title:    "Too large for Figaro",
		Detail: fmt.Sprintf(
			"This file is %s; Figaro's editor limit is 50 MB. It was not read or added to search.",
			formatFileIssueSize(info.Size()),
		),
		Guidance: "Open it with the default application, or reduce its size before checking again.",
		Size:     info.Size(),
	}
}

// vaultFileContentIssue classifies bytes only after the metadata admission
// check. NUL-containing files and invalid UTF-8 receive distinct recovery
// guidance; neither is described as corrupt without evidence of corruption.
func vaultFileContentIssue(path string, data []byte) *VaultFileIssue {
	if bytes.IndexByte(data, 0) >= 0 {
		return &VaultFileIssue{
			Path:     path,
			Code:     fileIssueBinary,
			Severity: "warning",
			Title:    "File appears to be binary",
			Detail:   "The file contains binary data, so Figaro did not open or index it as text.",
			Guidance: "Open it with the default application, or rename it if it is not a Markdown document.",
			Size:     int64(len(data)),
		}
	}
	if !utf8.Valid(data) {
		return &VaultFileIssue{
			Path:     path,
			Code:     fileIssueUnsupportedEncoding,
			Severity: "warning",
			Title:    "Encoding isn't supported",
			Detail:   "The file is not valid UTF-8, so Figaro did not open or add it to search.",
			Guidance: "Convert a copy to UTF-8, then check the file again.",
			Size:     int64(len(data)),
		}
	}
	return nil
}

func vaultFileReadIssue(path string, readErr error) *VaultFileIssue {
	cause := strings.TrimSpace(fmt.Sprint(readErr))
	if cause == "" {
		cause = "unknown read error"
	}
	return &VaultFileIssue{
		Path:     path,
		Code:     fileIssueUnreadable,
		Severity: "danger",
		Title:    "File couldn't be read",
		Detail:   fmt.Sprintf("Figaro could not read this file: %s. The file was not changed.", cause),
		Guidance: "Check its permissions and whether another application has locked it, then check again.",
	}
}

func isDiskFullFailure(err error) bool {
	message := strings.ToLower(fmt.Sprint(err))
	return errors.Is(err, syscall.ENOSPC) ||
		strings.Contains(message, "no space left") ||
		strings.Contains(message, "disk is full") ||
		strings.Contains(message, "disk full") ||
		strings.Contains(message, "not enough disk space") ||
		strings.Contains(message, "insufficient disk space")
}

func survivesVaultIndexInspection(issue VaultFileIssue) bool {
	if !strings.HasSuffix(strings.ToLower(issue.Path), ".md") {
		return true
	}
	switch issue.Code {
	case fileIssueConfigRecovered, fileIssueConfigUnreadable, fileIssueConfigWriteFailed,
		fileIssueHistoryUnavailable, fileIssueDiskFull:
		return true
	default:
		return false
	}
}

func (a *App) replaceVaultFileIssues(issues map[string]VaultFileIssue) {
	a.fileIssuesMu.Lock()
	next := make(map[string]VaultFileIssue, len(issues)+len(a.fileIssues))
	for path, issue := range a.fileIssues {
		if survivesVaultIndexInspection(issue) {
			next[path] = issue
		}
	}
	for path, issue := range issues {
		next[path] = issue
	}
	a.fileIssues = next
	a.fileIssuesMu.Unlock()
}

func (a *App) setVaultFileIssue(path string, issue *VaultFileIssue) {
	if issue == nil {
		a.removeVaultFileIssue(path)
		return
	}
	issue.Path = filepathSlash(path)
	a.fileIssuesMu.Lock()
	a.fileIssues[issue.Path] = *issue
	a.fileIssuesMu.Unlock()
}

func (a *App) removeVaultFileIssue(path string) {
	path = filepathSlash(path)
	a.fileIssuesMu.Lock()
	delete(a.fileIssues, path)
	a.fileIssuesMu.Unlock()
}

func (a *App) removeVaultFileIssuesBelow(path string) {
	path = filepathSlash(path)
	a.fileIssuesMu.Lock()
	for issuePath := range a.fileIssues {
		if issuePath == path || strings.HasPrefix(issuePath, path+"/") {
			delete(a.fileIssues, issuePath)
		}
	}
	a.fileIssuesMu.Unlock()
}

func (a *App) remapVaultFileIssues(oldPath string, newPath string) {
	oldPath = filepathSlash(oldPath)
	newPath = filepathSlash(newPath)
	a.fileIssuesMu.Lock()
	moved := make(map[string]VaultFileIssue)
	for issuePath, issue := range a.fileIssues {
		if issuePath != oldPath && !strings.HasPrefix(issuePath, oldPath+"/") {
			continue
		}
		delete(a.fileIssues, issuePath)
		futurePath := newPath + strings.TrimPrefix(issuePath, oldPath)
		issue.Path = futurePath
		moved[futurePath] = issue
	}
	for issuePath, issue := range moved {
		a.fileIssues[issuePath] = issue
	}
	a.fileIssuesMu.Unlock()
}

// GetVaultFileIssues returns the current background-inspection findings. It
// never starts a scan, so the call remains cheap and cannot interrupt writing.
func (a *App) GetVaultFileIssues() []VaultFileIssue {
	a.fileIssuesMu.RLock()
	issues := make([]VaultFileIssue, 0, len(a.fileIssues))
	for _, issue := range a.fileIssues {
		issues = append(issues, issue)
	}
	a.fileIssuesMu.RUnlock()
	sort.Slice(issues, func(i, j int) bool {
		if issues[i].Severity != issues[j].Severity {
			return issues[i].Severity == "danger"
		}
		return strings.ToLower(issues[i].Path) < strings.ToLower(issues[j].Path)
	})
	return issues
}

// RecheckVaultFileIssues retries only files which currently have findings.
// Resolved Markdown is restored to the warm index without reopening unrelated
// notes; persistent findings remain available to the same diagnostics UI.
func (a *App) RecheckVaultFileIssues() ([]VaultFileIssue, error) {
	a.fileIssuesMu.RLock()
	issues := make([]VaultFileIssue, 0, len(a.fileIssues))
	for _, issue := range a.fileIssues {
		issues = append(issues, issue)
	}
	a.fileIssuesMu.RUnlock()
	sort.Slice(issues, func(i, j int) bool { return issues[i].Path < issues[j].Path })

	a.vaultMu.Lock()
	defer a.vaultMu.Unlock()
	root, err := a.openVaultRoot()
	if err != nil {
		return a.GetVaultFileIssues(), err
	}
	defer root.Close()

	for _, existing := range issues {
		path := existing.Path
		if path == ".git" && (existing.Code == fileIssueHistoryUnavailable || existing.Code == fileIssueDiskFull) {
			history, historyErr := NewHistoryService(a.vaultPath)
			if historyErr != nil {
				if isDiskFullFailure(historyErr) {
					existing.Code = fileIssueDiskFull
					existing.Severity = "danger"
					existing.Title = "Disk full — local history is unavailable"
					existing.Guidance = "Free storage space before relying on version history, then check again. Notes can still be edited."
				} else {
					existing.Code = fileIssueHistoryUnavailable
					existing.Severity = "warning"
					existing.Title = "Local history is unavailable"
					existing.Guidance = "Keep editing normally. Repair or restore the .git folder before relying on version history, then check again."
				}
				existing.Detail = fmt.Sprintf("Figaro could not open the vault's local Git history: %v. Notes can still be edited and saved.", historyErr)
				a.setVaultFileIssue(path, &existing)
				continue
			}
			history.SetVaultReadLocker(&a.vaultMu)
			history.SetCommitCallback(func() { a.emitRuntimeEvent("vault:history-changed") })
			a.history = history
			a.removeVaultFileIssue(path)
			continue
		}
		if strings.HasPrefix(existing.Code, "configuration_") ||
			(existing.Code == fileIssueDiskFull && path == ".config/settings.json") {
			info, statErr := root.Stat(path)
			if statErr != nil {
				existing.Detail = fmt.Sprintf("Figaro still cannot inspect settings.json: %v. Notes remain unaffected.", statErr)
				a.setVaultFileIssue(path, &existing)
				continue
			}
			data, readErr := root.ReadFile(path)
			var settings map[string]interface{}
			if readErr != nil || json.Unmarshal(data, &settings) != nil || settings == nil {
				existing.Code = fileIssueConfigUnreadable
				existing.Severity = "warning"
				existing.Title = "Settings could not be read"
				existing.Detail = "Figaro is still using safe defaults because settings.json is not a valid JSON object. The original file was not overwritten."
				existing.Guidance = "Preserve settings.json, repair its JSON, and check again."
				a.setVaultFileIssue(path, &existing)
				continue
			}
			if existing.Code == fileIssueConfigWriteFailed || existing.Code == fileIssueDiskFull {
				if writeErr := writeRootFileAtomic(root, path, data, info.Mode()); writeErr != nil {
					existing.Detail = fmt.Sprintf("Figaro still cannot save settings.json: %v. Notes remain unaffected.", writeErr)
					a.setVaultFileIssue(path, &existing)
					continue
				}
			}
			a.removeVaultFileIssue(path)
			continue
		}
		info, statErr := root.Stat(path)
		if statErr != nil {
			if errors.Is(statErr, fs.ErrNotExist) {
				a.removeVaultFileIssue(path)
				continue
			}
			a.setVaultFileIssue(path, vaultFileReadIssue(path, statErr))
			continue
		}
		if issue := vaultFileMetadataIssue(path, info); issue != nil {
			a.setVaultFileIssue(path, issue)
			continue
		}
		data, readErr := root.ReadFile(path)
		if readErr != nil {
			a.setVaultFileIssue(path, vaultFileReadIssue(path, readErr))
			continue
		}
		if issue := vaultFileContentIssue(path, data); issue != nil {
			a.setVaultFileIssue(path, issue)
			continue
		}
		a.removeVaultFileIssue(path)
		if strings.HasSuffix(strings.ToLower(path), ".md") {
			a.updateVaultIndexFileLocked(path, info, string(data))
		}
	}
	return a.GetVaultFileIssues(), nil
}

func filepathSlash(path string) string {
	return strings.ReplaceAll(path, "\\", "/")
}
