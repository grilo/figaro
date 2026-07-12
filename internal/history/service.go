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
	repo       *git.Repository
	repoPath   string
	vaultMu    VaultReadLocker
	mu         sync.Mutex
	stopTicker chan struct{}
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

// SchedulerActive reports whether the auto-commit scheduler is running.
// It is useful to the Wails facade and its lifecycle tests without exposing
// the service's synchronization internals.
func (h *Service) SchedulerActive() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.stopTicker != nil
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
	if _, err := worktree.Add(relPath); err != nil {
		return fmt.Errorf("stage file %s: %w", relPath, err)
	}

	status, err := worktree.Status()
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
	return nil
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

	commits, err := h.repo.Log(&git.LogOptions{Order: git.LogOrderCommitterTime, All: true})
	if err != nil {
		return nil, fmt.Errorf("get log: %w", err)
	}
	defer commits.Close()

	var entries []Entry
	err = commits.ForEach(func(commit *object.Commit) error {
		tree, treeErr := commit.Tree()
		if treeErr != nil {
			return nil
		}
		if _, findErr := tree.FindEntry(relPath); findErr != nil {
			return nil
		}
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

// StartAutoCommit starts a background scheduler, or stops it when passed 0.
func (h *Service) StartAutoCommit(intervalSeconds int) {
	h.mu.Lock()
	previousStop := h.stopTicker
	h.stopTicker = nil
	if intervalSeconds > 0 {
		h.stopTicker = make(chan struct{})
	}
	stop := h.stopTicker
	h.mu.Unlock()

	if previousStop != nil {
		close(previousStop)
	}
	if stop == nil {
		log.Println("[history] Auto-commit disabled")
		return
	}

	interval := time.Duration(intervalSeconds) * time.Second
	log.Println("[history] Auto-commit scheduler enabled")
	go func(stop <-chan struct{}) {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				h.commitAllModified()
			case <-stop:
				return
			}
		}
	}(stop)
}

// CommitAllModified stages and commits all modified tracked files.
func (h *Service) CommitAllModified() error {
	h.lockVaultRead()
	defer h.unlockVaultRead()
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.repo == nil {
		return nil
	}
	return h.commitAllModifiedLocked()
}

func (h *Service) commitAllModified() {
	h.lockVaultRead()
	defer h.unlockVaultRead()
	h.mu.Lock()
	defer h.mu.Unlock()
	if err := h.commitAllModifiedLocked(); err != nil {
		log.Println("[history] Auto-commit failed:", err)
	}
}

func (h *Service) commitAllModifiedLocked() error {
	if h.repo == nil {
		return nil
	}
	worktree, err := h.repo.Worktree()
	if err != nil {
		return fmt.Errorf("get worktree: %w", err)
	}
	status, err := worktree.Status()
	if err != nil {
		return fmt.Errorf("get status: %w", err)
	}

	count := 0
	for path, statusFile := range status {
		if statusFile.Worktree == git.Modified || statusFile.Worktree == git.Added || statusFile.Worktree == git.Deleted {
			if _, err := worktree.Add(path); err != nil {
				return fmt.Errorf("stage %s: %w", path, err)
			}
			count++
		}
	}
	if count == 0 {
		return nil
	}

	message := fmt.Sprintf("auto-save: %d file(s) — %s", count, time.Now().Format("2006-01-02 15:04:05"))
	if _, err := worktree.Commit(message, &git.CommitOptions{
		Author: &object.Signature{Name: "figaro", Email: "figaro@local", When: time.Now()},
	}); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	log.Printf("[history] Auto-committed %d file(s)", count)
	return nil
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
