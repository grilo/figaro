package history

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"figaro/internal/activity"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/object"
)

const activityMaxFileBytes = 2 * 1024 * 1024
const activityMaxHistoryBytes = 32 * 1024 * 1024
const activityMaxRevisions = 256
const activityMaxCommits = 20000

// GetFileActivity reads immutable Git objects without retaining the mutation
// lock. An autosave can proceed while older passage attribution is calculated.
// Git is the durable source; the bounded cache is disposable across restarts.
func (h *Service) GetFileActivity(relPath string) (*activity.Document, error) {
	if !filepath.IsLocal(relPath) || strings.ContainsAny(relPath, "\\:") {
		return nil, fmt.Errorf("invalid activity path")
	}
	h.mu.Lock()
	repo := h.repo
	h.mu.Unlock()
	if repo == nil {
		return nil, fmt.Errorf("history not available")
	}
	head, err := repo.Head()
	if errors.Is(err, plumbing.ErrReferenceNotFound) {
		return &activity.Document{Lines: []activity.Line{}, Events: []activity.Event{}}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read activity head: %w", err)
	}
	root, err := os.OpenRoot(h.repoPath)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	pathBytes, err := ReadActivityPaths(root)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	pathHistory, err := activity.ReadPathHistory(pathBytes)
	if err != nil {
		return nil, err
	}
	key := fmt.Sprintf("%s:%s:%x", head.Hash().String(), filepath.ToSlash(relPath), sha256.Sum256(pathBytes))
	// Keep duplicate refreshes behind one computation, using a separate lock
	// from Git writes. Callers never run this operation on the renderer thread.
	h.activityMu.Lock()
	defer h.activityMu.Unlock()
	if cached := h.activityCache[key]; cached != nil {
		return cached, nil
	}
	commit, err := repo.CommitObject(head.Hash())
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	snapshots, complete, err := readActivitySnapshotsWithPaths(ctx, commit, filepath.ToSlash(relPath), pathHistory)
	if err != nil {
		return nil, err
	}
	result := activity.Build(snapshots, complete)
	result.Revision = head.Hash().String()
	if complete {
		if len(h.activityCache) >= 4 {
			h.activityCache = make(map[string]*activity.Document)
		}
		if h.activityCache == nil {
			h.activityCache = make(map[string]*activity.Document)
		}
		h.activityCache[key] = &result
	}
	return &result, nil
}

func activityFile(commit *object.Commit, path string) (*object.File, error) {
	file, err := commit.File(path)
	if errors.Is(err, object.ErrFileNotFound) || errors.Is(err, object.ErrEntryNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if file.Mode != filemode.Regular && file.Mode != filemode.Executable {
		return nil, fmt.Errorf("activity is available only for regular text files")
	}
	if file.Size > activityMaxFileBytes {
		return nil, fmt.Errorf("activity is limited to notes up to 2 MiB")
	}
	return file, nil
}

func previousActivityPath(ctx context.Context, parent, current *object.Commit, path string) (string, error) {
	before, err := parent.Tree()
	if err != nil {
		return "", err
	}
	after, err := current.Tree()
	if err != nil {
		return "", err
	}
	changes, err := object.DiffTreeWithOptions(ctx, before, after, &object.DiffTreeOptions{DetectRenames: true, RenameScore: 80, RenameLimit: 64})
	if err != nil {
		return "", err
	}
	for _, change := range changes {
		if change.To.Name == path && change.From.Name != "" {
			return change.From.Name, nil
		}
	}
	return "", nil
}

// The first-parent sequence reflects revisions recorded on the current branch.
// A bounded/incomplete walk explicitly leaves its oldest baseline unattributed.
func readActivitySnapshots(ctx context.Context, commit *object.Commit, path string) ([]activity.Snapshot, bool, error) {
	return readActivitySnapshotsWithPaths(ctx, commit, path, activity.PathHistory{})
}

func readActivitySnapshotsWithPaths(ctx context.Context, commit *object.Commit, path string, paths activity.PathHistory) ([]activity.Snapshot, bool, error) {
	path = activity.PathAtRevision(paths, path, commit.Hash.String())
	snapshots := []activity.Snapshot{}
	totalBytes := int64(0)
	complete := false
	for visited := 0; commit != nil; visited++ {
		current, err := activityFile(commit, path)
		if err != nil {
			return nil, false, err
		}
		if current == nil {
			complete = true
			break
		}
		if ctx.Err() != nil || visited >= activityMaxCommits || len(snapshots) >= activityMaxRevisions || totalBytes+current.Size > activityMaxHistoryBytes {
			source, err := current.Contents()
			if err != nil {
				return nil, false, err
			}
			snapshots = append(snapshots, activity.Snapshot{Revision: commit.Hash.String(), Path: path, Timestamp: float64(commit.Committer.When.UnixMilli()) / 1000, Source: source})
			break
		}
		var parent *object.Commit
		if commit.NumParents() > 0 {
			parent, err = commit.Parent(0)
			if err != nil {
				return nil, false, err
			}
		}
		previousPath := path
		var previous *object.File
		if parent != nil {
			previousPath = activity.PathAtRevision(paths, path, parent.Hash.String())
			previous, err = activityFile(parent, previousPath)
			if err != nil {
				return nil, false, err
			}
			if previous == nil {
				previousPath, err = previousActivityPath(ctx, parent, commit, path)
				if err != nil {
					return nil, false, err
				}
				if previousPath != "" {
					previous, err = activityFile(parent, previousPath)
					if err != nil {
						return nil, false, err
					}
				}
			}
		}
		if previous == nil || previous.Hash != current.Hash {
			source, err := current.Contents()
			if err != nil {
				return nil, false, err
			}
			snapshots = append(snapshots, activity.Snapshot{Revision: commit.Hash.String(), Path: path, Timestamp: float64(commit.Committer.When.UnixMilli()) / 1000, Source: source})
			totalBytes += current.Size
		}
		if previous == nil {
			complete = true
			break
		}
		commit = parent
		path = previousPath
	}
	slices.Reverse(snapshots)
	return snapshots, complete, nil
}

// ActivityHead supplies the immutable boundary for a transactional path move.
func (h *Service) ActivityHead() (string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.repo == nil {
		return "", nil
	}
	head, err := h.repo.Head()
	if errors.Is(err, plumbing.ErrReferenceNotFound) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return head.Hash().String(), nil
}
