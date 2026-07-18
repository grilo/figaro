// Package history owns Figaro's local Git-backed revision service.
package history

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"figaro/internal/vault"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// Entry represents a single Git commit for history display.
type Entry struct {
	Hash      string  `json:"hash"`
	Timestamp float64 `json:"timestamp"`
	Message   string  `json:"message"`
}

// VaultReadLocker lets the host serialize history reads with vault mutations.
type VaultReadLocker interface {
	RLock()
	RUnlock()
}

// Service manages Git operations for file versioning.
type Service struct {
	repo     *git.Repository
	repoPath string
	vaultMu  VaultReadLocker
	mu       sync.Mutex
	onCommit func()
}

// New initializes or opens a Git repository in the vault directory.
func New(vaultPath string) (*Service, error) {
	absPath, err := filepath.Abs(vaultPath)
	if err != nil {
		return nil, fmt.Errorf("resolve vault path: %w", err)
	}

	repo, err := git.PlainOpen(absPath)
	if err == git.ErrRepositoryNotExists {
		repo, err = git.PlainInit(absPath, false)
		if err != nil {
			return nil, fmt.Errorf("init git repo: %w", err)
		}
		log.Println("[history] Initialized git repository")
	} else if err != nil {
		return nil, fmt.Errorf("open git repo: %w", err)
	}
	if err := ensureConfigIgnored(absPath); err != nil {
		return nil, err
	}

	return &Service{repo: repo, repoPath: absPath}, nil
}

// SetVaultReadLocker attaches the owning app's vault lock after construction.
func (h *Service) SetVaultReadLocker(locker VaultReadLocker) {
	h.mu.Lock()
	h.vaultMu = locker
	h.mu.Unlock()
}

// SetCommitCallback registers a lightweight notification invoked after a
// successful revision. The callback runs asynchronously so native UI event
// delivery can never hold the repository lock.
func (h *Service) SetCommitCallback(callback func()) {
	h.mu.Lock()
	h.onCommit = callback
	h.mu.Unlock()
}

// ensureConfigIgnored keeps Figaro's own session/settings files out of the
// vault's automatic Git history without replacing an existing .gitignore.
func ensureConfigIgnored(vaultPath string) error {
	root, err := os.OpenRoot(vaultPath)
	if err != nil {
		return fmt.Errorf("open vault root for gitignore: %w", err)
	}
	defer root.Close()

	data, err := root.ReadFile(".gitignore")
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("read gitignore: %w", err)
	}
	content := string(data)
	for _, line := range strings.Split(content, "\n") {
		if strings.TrimSpace(line) == ".config/" {
			return nil
		}
	}
	if content != "" && !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	content += ".config/\n"
	if err := vault.WriteFileAtomic(root, ".gitignore", []byte(content), 0644); err != nil {
		return fmt.Errorf("write gitignore: %w", err)
	}
	return nil
}

// CommitFile stages and commits a single file with an auto-generated message.
func (h *Service) CommitFile(relPath string) error {
	h.lockVaultRead()
	defer h.unlockVaultRead()
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.commitFileLocked(relPath)
}

func (h *Service) commitFileLocked(relPath string) error {
	if h.repo == nil {
		return fmt.Errorf("history service not initialized")
	}

	worktree, err := h.repo.Worktree()
	if err != nil {
		return fmt.Errorf("get worktree: %w", err)
	}
	status, err := worktree.Status()
	if err != nil {
		return fmt.Errorf("check status: %w", err)
	}
	targetStatus, targetChanged := status[filepath.ToSlash(relPath)]
	if !targetChanged || (targetStatus.Staging == git.Unmodified && targetStatus.Worktree == git.Unmodified) {
		return nil
	}
	// A single-note history action must never absorb changes the user staged
	// independently. go-git commits the entire index, so refuse safely before
	// touching it when another path is already staged.
	for path, statusFile := range status {
		if path != filepath.ToSlash(relPath) && statusFile.Staging != git.Unmodified && statusFile.Staging != git.Untracked {
			return fmt.Errorf("cannot commit %s while %s has staged changes", relPath, path)
		}
	}
	if _, err := worktree.Add(relPath); err != nil {
		return fmt.Errorf("stage file %s: %w", relPath, err)
	}

	status, err = worktree.Status()
	if err != nil {
		return fmt.Errorf("check status: %w", err)
	}
	hasStaged := false
	for _, statusFile := range status {
		if statusFile.Staging != git.Unmodified && statusFile.Staging != git.Untracked {
			hasStaged = true
			break
		}
	}
	if !hasStaged {
		return nil
	}

	message := fmt.Sprintf("auto: %s — %s", relPath, time.Now().Format("2006-01-02 15:04:05"))
	if _, err := worktree.Commit(message, &git.CommitOptions{
		Author: &object.Signature{Name: "figaro", Email: "figaro@local", When: time.Now()},
	}); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	log.Println("[history] Committed:", relPath)
	h.notifyCommitLocked()
	return nil
}

// HasUncommittedChanges reports whether one vault-relative path differs from
// HEAD in either the worktree or index. Other vault changes are irrelevant.
func (h *Service) HasUncommittedChanges(relPath string) (bool, error) {
	h.lockVaultRead()
	defer h.unlockVaultRead()
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.repo == nil {
		return false, nil
	}
	worktree, err := h.repo.Worktree()
	if err != nil {
		return false, fmt.Errorf("get worktree: %w", err)
	}
	status, err := worktree.Status()
	if err != nil {
		return false, fmt.Errorf("check status: %w", err)
	}
	fileStatus, exists := status[filepath.ToSlash(relPath)]
	if !exists {
		return false, nil
	}
	return fileStatus.Staging != git.Unmodified || fileStatus.Worktree != git.Unmodified, nil
}

func (h *Service) notifyCommitLocked() {
	if h.onCommit != nil {
		go h.onCommit()
	}
}

// GetFileHistory returns the Git log for a specific file.
func (h *Service) GetFileHistory(relPath string) ([]Entry, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.getFileHistoryLocked(relPath)
}

func (h *Service) getFileHistoryLocked(relPath string) ([]Entry, error) {
	if h.repo == nil {
		return nil, fmt.Errorf("history service not initialized")
	}

	fileName := filepath.ToSlash(relPath)
	// Let go-git filter the log by paths changed in each commit instead of
	// opening every commit tree and merely checking whether the file happened
	// to exist at that point in history. This also keeps the status-bar count
	// accurate when other notes are committed.
	commits, err := h.repo.Log(&git.LogOptions{
		Order:    git.LogOrderCommitterTime,
		All:      true,
		FileName: &fileName,
	})
	if err != nil {
		return nil, fmt.Errorf("get log: %w", err)
	}
	defer commits.Close()

	var entries []Entry
	err = commits.ForEach(func(commit *object.Commit) error {
		entries = append(entries, Entry{
			Hash:      commit.Hash.String(),
			Timestamp: float64(commit.Author.When.UnixNano()) / 1e9,
			Message:   commit.Message,
		})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("iterate commits: %w", err)
	}
	return entries, nil
}

// GetFileVersion returns a file's content at a specific commit hash.
func (h *Service) GetFileVersion(relPath string, hash string) (string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.getFileVersionLocked(relPath, hash)
}

func (h *Service) getFileVersionLocked(relPath string, hash string) (string, error) {
	if h.repo == nil {
		return "", fmt.Errorf("history service not initialized")
	}

	commit, err := h.repo.CommitObject(plumbing.NewHash(hash))
	if err != nil {
		return "", fmt.Errorf("get commit %s: %w", hash, err)
	}
	tree, err := commit.Tree()
	if err != nil {
		return "", fmt.Errorf("get tree: %w", err)
	}
	entry, err := tree.FindEntry(relPath)
	if err != nil {
		shortHash := hash
		if len(shortHash) > 7 {
			shortHash = shortHash[:7]
		}
		log.Printf("[history] GetFileVersion: file %q not found in commit %s: %v", relPath, shortHash, err)
		return "", fmt.Errorf("find file %s in commit %s: %w", relPath, hash, err)
	}

	blob, err := h.repo.BlobObject(entry.Hash)
	if err != nil {
		return "", fmt.Errorf("get blob: %w", err)
	}
	reader, err := blob.Reader()
	if err != nil {
		return "", fmt.Errorf("read blob: %w", err)
	}
	defer reader.Close()

	buffer := make([]byte, blob.Size)
	if _, err := io.ReadFull(reader, buffer); err != nil {
		return "", fmt.Errorf("read blob content: %w", err)
	}
	return string(buffer), nil
}

// CommitCount returns the total number of commits for a file.
func (h *Service) CommitCount(relPath string) (int, error) {
	entries, err := h.GetFileHistory(relPath)
	if err != nil {
		return 0, err
	}
	return len(entries), nil
}

func (h *Service) lockVaultRead() {
	h.mu.Lock()
	locker := h.vaultMu
	h.mu.Unlock()
	if locker != nil {
		locker.RLock()
	}
}

func (h *Service) unlockVaultRead() {
	h.mu.Lock()
	locker := h.vaultMu
	h.mu.Unlock()
	if locker != nil {
		locker.RUnlock()
	}
}
