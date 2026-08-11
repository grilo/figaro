package history

import (
	"bufio"
	"errors"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/format/gitignore"
	"github.com/go-git/go-git/v5/plumbing/format/index"
	"github.com/go-git/go-git/v5/plumbing/object"
)

type gitPathState struct {
	exists bool
	hash   plumbing.Hash
	mode   filemode.FileMode
}

func gitPathStatesDiffer(left, right gitPathState) bool {
	return left.exists != right.exists ||
		(left.exists && (left.hash != right.hash || left.mode != right.mode))
}

// pathHasUncommittedChanges answers the file-scoped UI question without
// constructing go-git's repository-wide Merkle trees. The bool pair is
// (dirty, needsFullStatus); submodules retain go-git's complete fallback.
func (h *Service) pathHasUncommittedChanges(worktree *git.Worktree, relPath string) (bool, bool, error) {
	cleanPath := filepath.ToSlash(filepath.Clean(filepath.FromSlash(relPath)))
	idx, err := h.repo.Storer.Index()
	if err != nil {
		return false, false, err
	}

	indexState, indexEntry, conflicted := indexedPathState(idx, cleanPath)
	if conflicted {
		return true, false, nil
	}
	if indexEntry != nil && (indexEntry.Mode == filemode.Submodule || indexEntry.SkipWorktree) {
		return false, true, nil
	}
	headState, err := h.headPathState(cleanPath)
	if err != nil {
		return false, false, err
	}
	if gitPathStatesDiffer(headState, indexState) {
		return true, false, nil
	}

	root, err := os.OpenRoot(h.repoPath)
	if err != nil {
		return false, false, err
	}
	defer root.Close()
	info, err := root.Lstat(filepath.FromSlash(cleanPath))
	if os.IsNotExist(err) {
		return indexState.exists, false, nil
	}
	if err != nil {
		return false, false, err
	}
	if !indexState.exists {
		if info.Mode()&os.ModeSocket != 0 {
			return false, false, nil
		}
		ignored := pathIgnoredByWorktree(root, worktree.Excludes, cleanPath, info.IsDir())
		return !ignored, false, nil
	}

	worktreeMode, err := filemode.NewFromOSFileMode(info.Mode())
	if err != nil || worktreeMode != indexState.mode {
		return true, false, nil
	}
	if indexedMetadataProvesClean(idx.ModTime, indexEntry, info, worktreeMode) {
		return false, false, nil
	}
	worktreeHash, err := rootPathBlobHash(root, cleanPath, info)
	if err != nil {
		// go-git treats an unreadable tracked file as a zero hash, which is
		// observably dirty rather than turning the status control into an error.
		return true, false, nil
	}
	return worktreeHash != indexState.hash, false, nil
}

func indexedPathState(idx *index.Index, relPath string) (gitPathState, *index.Entry, bool) {
	var found *index.Entry
	for _, entry := range idx.Entries {
		if entry.Name != relPath {
			continue
		}
		if found != nil || entry.Stage != 0 || entry.IntentToAdd {
			return gitPathState{}, nil, true
		}
		found = entry
	}
	if found == nil {
		return gitPathState{}, nil, false
	}
	return gitPathState{exists: true, hash: found.Hash, mode: found.Mode}, found, false
}

func (h *Service) headPathState(relPath string) (gitPathState, error) {
	reference, err := h.repo.Head()
	if errors.Is(err, plumbing.ErrReferenceNotFound) {
		return gitPathState{}, nil
	}
	if err != nil {
		return gitPathState{}, err
	}
	commit, err := h.repo.CommitObject(reference.Hash())
	if err != nil {
		return gitPathState{}, err
	}
	tree, err := commit.Tree()
	if err != nil {
		return gitPathState{}, err
	}
	entry, err := tree.FindEntry(relPath)
	if errors.Is(err, object.ErrEntryNotFound) || errors.Is(err, object.ErrDirectoryNotFound) {
		return gitPathState{}, nil
	}
	if err != nil {
		return gitPathState{}, err
	}
	return gitPathState{exists: true, hash: entry.Hash, mode: entry.Mode}, nil
}

func indexedMetadataProvesClean(
	indexModTime time.Time,
	entry *index.Entry,
	info fs.FileInfo,
	mode filemode.FileMode,
) bool {
	if entry == nil || uint32(info.Size()) != entry.Size || mode != entry.Mode {
		return false
	}
	if !info.ModTime().IsZero() && !info.ModTime().Equal(entry.ModifiedAt) {
		return false
	}
	if indexModTime.IsZero() || info.ModTime().IsZero() || !info.ModTime().Before(indexModTime) {
		return false
	}
	return true
}

func rootPathBlobHash(root *os.Root, relPath string, info fs.FileInfo) (plumbing.Hash, error) {
	hasher := plumbing.NewHasher(plumbing.BlobObject, info.Size())
	if info.Mode()&os.ModeSymlink != 0 {
		target, err := root.Readlink(filepath.FromSlash(relPath))
		if err != nil {
			return plumbing.ZeroHash, err
		}
		_, err = hasher.Write([]byte(target))
		return hasher.Sum(), err
	}
	file, err := root.Open(filepath.FromSlash(relPath))
	if err != nil {
		return plumbing.ZeroHash, err
	}
	defer file.Close()
	if _, err := io.Copy(hasher, file); err != nil {
		return plumbing.ZeroHash, err
	}
	return hasher.Sum(), nil
}

func pathIgnoredByWorktree(
	root *os.Root,
	external []gitignore.Pattern,
	relPath string,
	isDir bool,
) bool {
	patterns := make([]gitignore.Pattern, 0, len(external)+8)
	patterns = appendIgnoreFilePatterns(patterns, root, ".gitignore", nil)

	parts := strings.Split(relPath, "/")
	base := make([]string, 0, len(parts)-1)
	for _, directory := range parts[:len(parts)-1] {
		base = append(base, directory)
		if gitignore.NewMatcher(patterns).Match(base, true) {
			break
		}
		basePath := strings.Join(base, "/")
		patterns = appendIgnoreFilePatterns(patterns, root, path.Join(basePath, ".gitignore"), base)
	}
	patterns = append(patterns, external...)
	return gitignore.NewMatcher(patterns).Match(parts, isDir)
}

func appendIgnoreFilePatterns(
	patterns []gitignore.Pattern,
	root *os.Root,
	relPath string,
	base []string,
) []gitignore.Pattern {
	file, err := root.Open(filepath.FromSlash(relPath))
	if err != nil {
		return patterns
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "#") || strings.TrimSpace(line) == "" {
			continue
		}
		patterns = append(patterns, gitignore.ParsePattern(line, base))
	}
	return patterns
}
