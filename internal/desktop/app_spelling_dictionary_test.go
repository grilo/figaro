package desktop

import (
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

func TestSpellingDictionaryPersistsVaultWordsWithoutChangingNotes(t *testing.T) {
	dir := t.TempDir()
	app := NewApp(dir)
	words, err := app.SpellingDictionaryLoad()
	if err != nil || len(words) != 0 {
		t.Fatalf("load = %v %v", words, err)
	}
	if _, err := os.Stat(filepath.Join(dir, spellingDictionaryPath)); !os.IsNotExist(err) {
		t.Fatal("read created dictionary")
	}
	writeTestFile(t, dir, "Memo.md", "Figaro works.")
	if _, err := app.SpellingDictionaryAdd("Figaro"); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SpellingDictionaryAdd("figaro"); err != nil {
		t.Fatal(err)
	}
	words, err = NewApp(dir).SpellingDictionaryLoad()
	if err != nil || !reflect.DeepEqual(words, []string{"figaro"}) {
		t.Fatalf("reopened words = %v %v", words, err)
	}
	if readTestFile(t, dir, "Memo.md") != "Figaro works." {
		t.Fatal("note changed")
	}
	info, err := os.Stat(filepath.Join(dir, spellingDictionaryPath))
	if err != nil || runtime.GOOS != "windows" && info.Mode().Perm()&0077 != 0 {
		t.Fatalf("dictionary permissions = %v %v", info, err)
	}
}

func TestSpellingDictionaryPreservesInvalidFileAndRejectsOutsideSymlinks(t *testing.T) {
	dir, outside := t.TempDir(), t.TempDir()
	app := NewApp(dir)
	for _, invalid := range []string{"", "{broken", `{"version":9,"words":[]}`} {
		writeTestFile(t, dir, spellingDictionaryPath, invalid)
		if _, err := app.SpellingDictionaryAdd("figaro"); err == nil {
			t.Fatal("accepted invalid dictionary")
		}
		if readTestFile(t, dir, spellingDictionaryPath) != invalid {
			t.Fatal("overwrote invalid dictionary")
		}
	}
	if err := os.Remove(filepath.Join(dir, spellingDictionaryPath)); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, outside, "words.json", `{"version":1,"words":["keep"]}`)
	if err := os.Symlink(filepath.Join(outside, "words.json"), filepath.Join(dir, spellingDictionaryPath)); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if _, err := app.SpellingDictionaryAdd("figaro"); err == nil {
		t.Fatal("followed dictionary outside vault")
	}
	if readTestFile(t, outside, "words.json") != `{"version":1,"words":["keep"]}` {
		t.Fatal("outside file changed")
	}
}
