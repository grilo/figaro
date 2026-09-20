package history

import (
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	"figaro/internal/vault"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/format/gitignore"
	"github.com/go-git/go-git/v5/plumbing/format/index"
	"github.com/go-git/go-git/v5/plumbing/object"
)

type historyFileSnapshot struct {
	data    []byte
	info    fs.FileInfo
	mode    filemode.FileMode
	ignored bool
}

// Only this rooted capture needs the content lock. Subsequent blob, index,
// tree, and commit writes use this immutable snapshot, never the live note.
func (h *Service) captureFile(path string, tracked bool, excludes []gitignore.Pattern) (historyFileSnapshot, error) {
	h.lockVaultRead()
	defer h.unlockVaultRead()
	root, err := os.OpenRoot(h.repoPath)
	if err != nil {
		return historyFileSnapshot{}, err
	}
	defer root.Close()
	info, err := root.Lstat(filepath.FromSlash(path))
	if os.IsNotExist(err) {
		return historyFileSnapshot{}, nil
	}
	if err != nil {
		return historyFileSnapshot{}, err
	}
	if !info.Mode().IsRegular() && info.Mode()&os.ModeSymlink == 0 {
		return historyFileSnapshot{}, fmt.Errorf("history requires a regular file or symbolic link: %s", path)
	}
	mode, err := filemode.NewFromOSFileMode(info.Mode())
	if err != nil {
		return historyFileSnapshot{}, err
	}
	snapshot := historyFileSnapshot{info: info, mode: mode}
	if !tracked && pathIgnoredByWorktree(root, excludes, path, false) {
		snapshot.ignored = true
		return snapshot, nil
	}
	if mode == filemode.Symlink {
		var target string
		target, err = root.Readlink(filepath.FromSlash(path))
		snapshot.data = []byte(target)
	} else {
		snapshot.data, err = root.ReadFile(filepath.FromSlash(path))
	}
	return snapshot, err
}

func (h *Service) historyHeadHash() (plumbing.Hash, error) {
	head, err := h.repo.Head()
	if errors.Is(err, plumbing.ErrReferenceNotFound) {
		return plumbing.ZeroHash, nil
	}
	if err != nil {
		return plumbing.ZeroHash, err
	}
	return head.Hash(), nil
}

// HEAD metadata is cached only under the repository mutex and exact commit
// hash. External Git commits invalidate it. No worktree files are enumerated.
func (h *Service) headEntries(hash plumbing.Hash) (map[string]gitPathState, error) {
	if h.commitEntries != nil && h.commitHead == hash {
		return h.commitEntries, nil
	}
	entries := make(map[string]gitPathState)
	if hash != plumbing.ZeroHash {
		commit, err := h.repo.CommitObject(hash)
		if err != nil {
			return nil, err
		}
		var visit func(plumbing.Hash, string, int) error
		visit = func(treeHash plumbing.Hash, prefix string, depth int) error {
			if depth > 1024 {
				return fmt.Errorf("Git tree is too deep")
			}
			tree, err := h.repo.TreeObject(treeHash)
			if err != nil {
				return err
			}
			for _, entry := range tree.Entries {
				if !fs.ValidPath(entry.Name) || entry.Name == "." || strings.Contains(entry.Name, "/") {
					return fmt.Errorf("invalid Git tree entry %q", entry.Name)
				}
				name := path.Join(prefix, entry.Name)
				if entry.Mode == filemode.Dir {
					if err := visit(entry.Hash, name, depth+1); err != nil {
						return err
					}
				} else {
					entries[name] = gitPathState{exists: true, hash: entry.Hash, mode: entry.Mode}
				}
			}
			return nil
		}
		if err := visit(commit.TreeHash, "", 0); err != nil {
			return nil, err
		}
	}
	h.commitHead, h.commitEntries = hash, entries
	return entries, nil
}

func (h *Service) commitFileLocked(relPath string) error {
	if h.repo == nil {
		return fmt.Errorf("history service not initialized")
	}
	clean, err := vault.RelativePath(relPath)
	if err != nil {
		return err
	}
	if clean == "." {
		return fmt.Errorf("a file path is required")
	}
	name := filepath.ToSlash(clean)
	for _, component := range strings.Split(name, "/") {
		if strings.EqualFold(component, ".git") {
			return fmt.Errorf("Git metadata cannot be recorded as a vault file")
		}
	}
	worktree, err := h.repo.Worktree()
	if err != nil {
		return err
	}
	original, err := h.repo.Storer.Index()
	if err != nil {
		return err
	}
	headHash, err := h.historyHeadHash()
	if err != nil {
		return err
	}
	head, err := h.headEntries(headHash)
	if err != nil {
		return err
	}
	indexed, _, _ := indexedPathState(original, name)
	snapshot, err := h.captureFile(name, indexed.exists, worktree.Excludes)
	if err != nil {
		return fmt.Errorf("capture %s for history: %w", name, err)
	}
	target := gitPathState{}
	if snapshot.info != nil && !snapshot.ignored {
		target = gitPathState{exists: true, hash: plumbing.ComputeHash(plumbing.BlobObject, snapshot.data), mode: snapshot.mode}
	}
	plan, err := planFileCommit(name, head, original, target, snapshot.ignored)
	if err != nil || (!plan.stage && !plan.commit) {
		return err
	}
	var entry *index.Entry
	if plan.target.exists {
		entry = &index.Entry{Name: name, Hash: target.hash, Mode: target.mode,
			Size: uint32(len(snapshot.data)), ModifiedAt: snapshot.info.ModTime()}
		if plan.stage {
			blob := h.repo.Storer.NewEncodedObject()
			blob.SetType(plumbing.BlobObject)
			blob.SetSize(int64(len(snapshot.data)))
			writer, err := blob.Writer()
			if err != nil {
				return err
			}
			_, writeErr := writer.Write(snapshot.data)
			if err := errors.Join(writeErr, writer.Close()); err != nil {
				return err
			}
			if _, err := h.repo.Storer.SetEncodedObject(blob); err != nil {
				return fmt.Errorf("store history snapshot: %w", err)
			}
		}
	}
	// An external Git operation may have changed the repository during slow
	// snapshot/blob I/O. Never overwrite its new staging area with our old copy.
	current, err := h.repo.Storer.Index()
	if err != nil {
		return err
	}
	currentHead, err := h.historyHeadHash()
	if err != nil {
		return err
	}
	if currentHead != headHash || !reflect.DeepEqual(original, current) {
		return fmt.Errorf("Git changed while saving history; retry to preserve the current index")
	}
	if plan.stage {
		if err := h.repo.Storer.SetIndex(stagedFileIndex(original, name, entry)); err != nil {
			return fmt.Errorf("stage history snapshot: %w", err)
		}
	}
	if !plan.commit {
		return nil
	}
	message := fmt.Sprintf("auto: %s — %s", relPath, time.Now().Format("2006-01-02 15:04:05"))
	hash, err := worktree.Commit(message, &git.CommitOptions{
		Author: &object.Signature{Name: "figaro", Email: "figaro@local", When: time.Now()},
	})
	if err != nil {
		if plan.stage {
			err = errors.Join(err, h.repo.Storer.SetIndex(original))
		}
		return fmt.Errorf("commit: %w", err)
	}
	if plan.target.exists {
		head[name] = plan.target
	} else {
		delete(head, name)
	}
	h.commitHead, h.commitEntries = hash, head
	log.Println("[history] Committed:", relPath)
	h.notifyCommitLocked()
	return nil
}
