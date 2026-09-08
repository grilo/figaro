package writing

import (
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"
)

func cacheFixture() []cacheAsset {
	return []cacheAsset{{"vale", []byte("verified executable"), 0700}, {"styles/rule.yml", []byte("pinned rule"), 0600}, {"figaro.ini", []byte("local config"), 0600}}
}

func TestWritingCacheReusesVerifiedFilesWithoutRewritingAndChangesWithRules(t *testing.T) {
	cache := t.TempDir()
	assets := cacheFixture()
	dir, err := installCachedAssets(cache, assets)
	if err != nil {
		t.Fatal(err)
	}
	stamp := time.Unix(100000, 0)
	if err := os.Chtimes(filepath.Join(dir, "vale"), stamp, stamp); err != nil {
		t.Fatal(err)
	}
	again, err := installCachedAssets(cache, assets)
	if err != nil || again != dir {
		t.Fatal(again, err)
	}
	info, err := os.Stat(filepath.Join(dir, "vale"))
	if err != nil || !info.ModTime().Equal(stamp) {
		t.Fatal("warm cache rewrote the executable", err)
	}
	assets[1].data = []byte("new pinned rule")
	updated, err := installCachedAssets(cache, assets)
	if err != nil || updated == dir {
		t.Fatal("rule update reused stale cache", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "vale")); err != nil {
		t.Fatal("updating cache removed another process's executable", err)
	}
}

func TestWritingCacheRepairsDamageMissingFilesExtraRulesAndUnsafePermissions(t *testing.T) {
	for _, damage := range []string{"content", "missing", "extra", "permissions"} {
		t.Run(damage, func(t *testing.T) {
			if damage == "permissions" && runtime.GOOS == "windows" {
				t.Skip("Windows uses ACLs")
			}
			cache := t.TempDir()
			assets := cacheFixture()
			dir, err := installCachedAssets(cache, assets)
			if err != nil {
				t.Fatal(err)
			}
			switch damage {
			case "content":
				err = os.WriteFile(filepath.Join(dir, "vale"), []byte("damaged executable!"), 0700)
			case "missing":
				err = os.Remove(filepath.Join(dir, "styles/rule.yml"))
			case "extra":
				err = os.WriteFile(filepath.Join(dir, "styles/untrusted.yml"), []byte("extra"), 0600)
			case "permissions":
				err = os.Chmod(filepath.Join(dir, "vale"), 0777)
			}
			if err != nil {
				t.Fatal(err)
			}
			if repaired, err := installCachedAssets(cache, assets); err != nil || repaired != dir {
				t.Fatal(repaired, err)
			}
			root, err := os.OpenRoot(cache)
			if err != nil {
				t.Fatal(err)
			}
			defer root.Close()
			if err := verifyCachedAssets(root, filepath.Base(dir), assets); err != nil {
				t.Fatal(err)
			}
			entries, _ := os.ReadDir(cache)
			if len(entries) != 1 {
				t.Fatal("partial preparation left behind", entries)
			}
		})
	}
}

func TestWritingCacheRepairDoesNotFollowSymlinksOutsideItsRoot(t *testing.T) {
	cache, outside := t.TempDir(), t.TempDir()
	assets := cacheFixture()
	dir, err := installCachedAssets(cache, assets)
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(outside, "original")
	if err := os.WriteFile(target, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(dir, "vale")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(dir, "vale")); err != nil {
		if runtime.GOOS == "windows" {
			t.Skipf("symlink privilege unavailable: %v", err)
		}
		t.Fatal(err)
	}
	if _, err := installCachedAssets(cache, assets); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(target)
	if string(data) != "keep" {
		t.Fatal("repair changed outside file")
	}
	if _, err := installCachedAssets(cache, []cacheAsset{{"../escape", []byte("bad"), 0600}}); err == nil {
		t.Fatal("accepted traversal")
	}
}

func TestWritingCacheConcurrentPreparationPublishesOneCompleteInstallation(t *testing.T) {
	cache := t.TempDir()
	var group sync.WaitGroup
	for range 4 {
		group.Go(func() {
			if _, err := installCachedAssets(cache, cacheFixture()); err != nil {
				t.Error(err)
			}
		})
	}
	group.Wait()
	entries, _ := os.ReadDir(cache)
	if len(entries) != 1 {
		t.Fatal(entries)
	}
}

func TestWritingCacheFailedPreparationLeavesPreviousInstallationIntact(t *testing.T) {
	cache := t.TempDir()
	dir, err := installCachedAssets(cache, cacheFixture())
	if err != nil {
		t.Fatal(err)
	}
	invalid := []cacheAsset{{"styles", []byte("file blocks directory"), 0600}, {"styles/rule.yml", []byte("new"), 0600}}
	if _, err := installCachedAssets(cache, invalid); err == nil {
		t.Fatal("expected preparation failure")
	}
	root, err := os.OpenRoot(cache)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	if err := verifyCachedAssets(root, filepath.Base(dir), cacheFixture()); err != nil {
		t.Fatal("failure damaged previous installation", err)
	}
	entries, _ := os.ReadDir(cache)
	if len(entries) != 1 {
		t.Fatal("partial installation retained", entries)
	}
}
