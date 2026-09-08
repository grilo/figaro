package writing

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"sync"
)

type cacheAsset struct {
	path string
	data []byte
	mode fs.FileMode
}

// The identity is derived only from bundled content, including configuration
// and rules. A release with changed rules cannot reuse an older installation.
func cacheIdentity(assets []cacheAsset) string {
	h := sha256.New()
	for _, asset := range assets {
		fmt.Fprintf(h, "%s\x00%o\x00%x\n", asset.path, asset.mode, sha256.Sum256(asset.data))
	}
	return fmt.Sprintf("%x", h.Sum(nil))
}

var cacheMu sync.Mutex

func prepareBundledCache() (string, string, error) {
	data, err := bundled.ReadFile("assets/vale-" + Version + "-" + runtime.GOOS + "-" + runtime.GOARCH + ".gz")
	if err != nil {
		return "", "", fmt.Errorf("bundled writing engine unavailable: %w", err)
	}
	reader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return "", "", err
	}
	binary, err := io.ReadAll(io.LimitReader(reader, (150<<20)+1))
	reader.Close()
	if err != nil {
		return "", "", err
	}
	if len(binary) > 150<<20 {
		return "", "", fmt.Errorf("bundled writing engine exceeds limit")
	}
	executable := "vale"
	if runtime.GOOS == "windows" {
		executable += ".exe"
	}
	assets := []cacheAsset{{executable, binary, 0700}}
	err = fs.WalkDir(bundled, "styles", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		data, err := bundled.ReadFile(path)
		if err != nil {
			return err
		}
		assets = append(assets, cacheAsset{path, data, 0600})
		if path == "styles/figaro.ini" {
			assets = append(assets, cacheAsset{"figaro.ini", data, 0600})
		}
		return nil
	})
	if err != nil {
		return "", "", err
	}
	sort.Slice(assets, func(i, j int) bool { return assets[i].path < assets[j].path })
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", "", err
	}
	dir, err := installCachedAssets(filepath.Join(cache, "Figaro", "writing"), assets)
	return dir, filepath.Join(dir, executable), err
}

// All reads and replacements below are confined to one private cache root.
// Build a complete sibling before replacing a damaged installation. Never
// extract into the active directory or trust a manifest from disk.
func installCachedAssets(cache string, assets []cacheAsset) (string, error) {
	for _, asset := range assets {
		if !fs.ValidPath(asset.path) || asset.path == "." {
			return "", fmt.Errorf("invalid bundled cache path")
		}
	}
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if err := os.MkdirAll(cache, 0700); err != nil {
		return "", err
	}
	root, err := os.OpenRoot(cache)
	if err != nil {
		return "", err
	}
	defer root.Close()
	key := cacheIdentity(assets)
	if verifyCachedAssets(root, key, assets) == nil {
		return filepath.Join(cache, key), nil
	}
	stage, err := os.MkdirTemp(cache, ".prepare-")
	if err != nil {
		return "", err
	}
	stageName := filepath.Base(stage)
	defer root.RemoveAll(stageName)
	for _, asset := range assets {
		target := filepath.Join(stageName, filepath.FromSlash(asset.path))
		if err := root.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return "", err
		}
		if err := root.WriteFile(target, asset.data, asset.mode); err != nil {
			return "", err
		}
	}
	if err := verifyCachedAssets(root, stageName, assets); err != nil {
		return "", err
	}
	// Another application process may have completed the same cache meanwhile.
	if verifyCachedAssets(root, key, assets) == nil {
		return filepath.Join(cache, key), nil
	}
	backup := stageName + "-previous"
	if err := root.Rename(key, backup); err != nil && !os.IsNotExist(err) {
		return "", err
	}
	if err := root.Rename(stageName, key); err != nil {
		if verifyCachedAssets(root, key, assets) == nil {
			_ = root.RemoveAll(backup)
			return filepath.Join(cache, key), nil
		}
		_ = root.Rename(backup, key)
		return "", err
	}
	_ = root.RemoveAll(backup)
	return filepath.Join(cache, key), nil
}

func verifyCachedAssets(root *os.Root, dir string, assets []cacheAsset) error {
	info, err := root.Lstat(dir)
	if err != nil {
		return err
	}
	if !info.IsDir() || (runtime.GOOS != "windows" && info.Mode().Perm() != 0700) {
		return fmt.Errorf("unsafe writing cache directory")
	}
	for _, asset := range assets {
		path := filepath.Join(dir, filepath.FromSlash(asset.path))
		for parent := filepath.Dir(path); parent != dir; parent = filepath.Dir(parent) {
			info, err := root.Lstat(parent)
			if err != nil {
				return err
			}
			if !info.IsDir() || (runtime.GOOS != "windows" && info.Mode().Perm() != 0700) {
				return fmt.Errorf("unsafe writing cache path")
			}
		}
		info, err := root.Lstat(path)
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() || info.Size() != int64(len(asset.data)) || (runtime.GOOS != "windows" && info.Mode().Perm() != asset.mode) {
			return fmt.Errorf("damaged writing cache file: %s", asset.path)
		}
		file, err := root.Open(path)
		if err != nil {
			return err
		}
		h := sha256.New()
		_, err = io.Copy(h, file)
		file.Close()
		if err != nil {
			return err
		}
		expected := sha256.Sum256(asset.data)
		if !bytes.Equal(h.Sum(nil), expected[:]) {
			return fmt.Errorf("damaged writing cache content: %s", asset.path)
		}
	}
	expectedPaths := make(map[string]bool, len(assets))
	for _, asset := range assets {
		expectedPaths[filepath.ToSlash(filepath.Join(dir, asset.path))] = true
	}
	return fs.WalkDir(root.FS(), dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() && !expectedPaths[path] {
			return fmt.Errorf("unexpected writing cache file: %s", path)
		}
		return nil
	})
}
