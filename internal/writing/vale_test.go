package writing

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestWritingStartupTimingsReportEmbeddedRuleInitialization(t *testing.T) {
	var stages []string
	engine, err := OpenWithTimings(func(stage string) func(error) {
		stages = append(stages, stage+":begin")
		return func(err error) {
			phase := "end"
			if err != nil {
				phase = "error"
			}
			stages = append(stages, stage+":"+phase)
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	defer engine.Close()
	want := []string{"writing-rules:begin", "writing-rules:end"}
	if !reflect.DeepEqual(stages, want) {
		t.Fatalf("wrong preparation stages: %v", stages)
	}
}

func TestPackageReviewRunsEveryRestoredValeRuleWithExactSourceRanges(t *testing.T) {
	data, err := os.ReadFile("../../tests/fixtures/writing-package-review.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct{ Rule, Source, Actual, NativeActual string }
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	engine, err := Open()
	if err != nil {
		t.Fatal(err)
	}
	defer engine.Close()
	for _, fixture := range fixtures {
		t.Run(fixture.Rule, func(t *testing.T) {
			source := "😀 " + fixture.Source
			output, err := engine.Analyze(fixture.Rule, source)
			if err != nil {
				t.Fatal(err)
			}
			var files map[string][]struct {
				Check, Match string
				Line         int
				Span         []int
			}
			if err := json.Unmarshal([]byte(output), &files); err != nil {
				t.Fatal(err)
			}
			seen := false
			for _, alerts := range files {
				for _, alert := range alerts {
					if alert.Check != fixture.Rule {
						continue
					}
					actual := fixture.Actual
					if fixture.NativeActual != "" {
						actual = fixture.NativeActual
					}
					if alert.Match != actual || alert.Line != 1 || len(alert.Span) != 2 {
						t.Fatalf("unexpected alert: %+v", alert)
					}
					if string([]rune(source)[alert.Span[0]-1:alert.Span[1]]) != alert.Match {
						t.Fatalf("invalid native source range: %+v", alert)
					}
					seen = true
				}
			}
			if !seen {
				t.Fatalf("restored rule missing: %s", output)
			}
		})
	}
}

func TestPackageReviewPinsEverySelectedWriteGoodRule(t *testing.T) {
	data, err := bundled.ReadFile("styles/write-good/SOURCE.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Revision string
		SHA256   map[string]string
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Revision != "c9ceca7f574248a201d5524b001099c5626c7519" {
		t.Fatal("unexpected pin")
	}
	paths, err := fs.Glob(bundled, "styles/write-good/*.yml")
	if err != nil || len(paths) != 7 || len(manifest.SHA256) != 7 {
		t.Fatal("unexpected rule inventory", paths, err)
	}
	for _, path := range paths {
		data, err := bundled.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if fmt.Sprintf("%x", sha256.Sum256(data)) != manifest.SHA256[filepath.Base(path)] {
			t.Fatal("pinned rule changed", path)
		}
	}
}

func TestBundledMicrosoftSelectedRulesPreserveAttachedUnits(t *testing.T) {
	var manifest struct {
		Revision string
		SHA256   map[string]string
	}
	data, err := bundled.ReadFile("styles/Microsoft/SOURCE.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Revision != "8b272ae9d6d6d82d54e3aafa8c1eb4550e4e971e" {
		t.Fatal("unexpected Microsoft pin", manifest.Revision)
	}
	paths, err := fs.Glob(bundled, "styles/Microsoft/*.yml")
	if err != nil || !reflect.DeepEqual(paths, []string{"styles/Microsoft/Acronyms.yml", "styles/Microsoft/Adverbs.yml", "styles/Microsoft/Jargon.yml", "styles/Microsoft/Passive.yml", "styles/Microsoft/SentenceLength.yml", "styles/Microsoft/Wordiness.yml"}) || len(manifest.SHA256) != 6 {
		t.Fatal("unselected Microsoft rules", paths, err)
	}
	for _, path := range paths {
		rule, err := bundled.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if fmt.Sprintf("%x", sha256.Sum256(rule)) != manifest.SHA256[filepath.Base(path)] {
			t.Fatal("pinned Microsoft rule changed", path)
		}
	}
	if google, _ := fs.Glob(bundled, "styles/Google/*.yml"); len(google) != 0 {
		t.Fatal("Google unit-spacing rules must not be bundled", google)
	}
	engine, err := Open()
	if err != nil {
		t.Fatal(err)
	}
	defer engine.Close()
	for _, sample := range []struct {
		source  string
		matches int
	}{
		{"😀 The SLO is ready. Its size is 8.1Mib and 10MB; latency is 20ms.", 1},
		{"The Service Level Objective (SLO) is ready. The SLO is useful.", 0},
		{"Use the API, JSON, and PDF. Its size is 8.1Mib, 10MB, and 20ms.", 0},
	} {
		output, err := engine.Analyze("acronym", sample.source)
		if err != nil {
			t.Fatal(err)
		}
		var files map[string][]struct{ Check, Match string }
		if err := json.Unmarshal([]byte(output), &files); err != nil {
			t.Fatal(err)
		}
		count := 0
		for _, alerts := range files {
			for _, alert := range alerts {
				if alert.Check == "write-good.TooWordy" && alert.Match == "Objective" {
					continue
				}
				if alert.Check != "Microsoft.Acronyms" || alert.Match != "SLO" {
					t.Fatalf("unrelated finding: %+v in %q", alert, sample.source)
				}
				count++
			}
		}
		if count != sample.matches {
			t.Fatalf("got %s for %q, want %d acronyms", output, sample.source, sample.matches)
		}
	}
	if _, err := bundled.ReadFile("styles/Microsoft/LICENSE"); err != nil {
		t.Fatal("Microsoft notice missing", err)
	}
}

func TestBundledProselintOnlySelectedPinnedRulesRunOffline(t *testing.T) {
	var manifest struct {
		Revision string
		SHA256   map[string]string
	}
	data, err := bundled.ReadFile("styles/proselint/SOURCE.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Revision != "8e24adbaa5dc6593b331f8bfab23c9af044af406" {
		t.Fatal("unexpected pin", manifest.Revision)
	}
	paths, err := fs.Glob(bundled, "styles/proselint/*.yml")
	if err != nil || len(paths) != 14 || len(manifest.SHA256) != 14 {
		t.Fatalf("unexpected selected rules: %v, %v", paths, err)
	}
	for _, path := range paths {
		data, err := bundled.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if fmt.Sprintf("%x", sha256.Sum256(data)) != manifest.SHA256[filepath.Base(path)] {
			t.Fatal("pinned rule changed", path)
		}
	}
	engine, err := Open()
	if err != nil {
		t.Fatal(err)
	}
	defer engine.Close()
	output, err := engine.Analyze("proselint", "😀 At the end of the day, I would argue that we need synergy. Amazing!! But this is normal.")
	if err != nil {
		t.Fatal(err)
	}
	var files map[string][]struct{ Check, Match string }
	if err := json.Unmarshal([]byte(output), &files); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	allowed := map[string]bool{"proselint.Cliches": true, "proselint.CorporateSpeak": true, "proselint.Hedging": true, "proselint.Hyperbole": true}
	for _, alerts := range files {
		for _, alert := range alerts {
			if strings.HasPrefix(alert.Check, "write-good.") || strings.HasPrefix(alert.Check, "Microsoft.") {
				continue
			}
			if !allowed[alert.Check] {
				t.Fatal("unselected proselint rule", alert)
			}
			seen[alert.Check] = true
		}
	}
	if !reflect.DeepEqual(seen, allowed) {
		t.Fatalf("missing selected rules: %s", output)
	}
	if _, err := bundled.ReadFile("styles/proselint/LICENSE"); err != nil {
		t.Fatal("bundled notice missing", err)
	}
}

func TestBundledValePinnedRulesAndUnicodePositions(t *testing.T) {
	configHome := t.TempDir()
	if err := os.MkdirAll(filepath.Join(configHome, "vale"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(configHome, "vale", ".vale.ini"), []byte("[unterminated global configuration"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("XDG_CONFIG_HOME", configHome)
	t.Setenv("VALE_CONFIG_PATH", filepath.Join(configHome, "not-figaro.ini"))
	t.Setenv("VALE_STYLES_PATH", filepath.Join(configHome, "not-figaro-styles"))
	engine, err := Open()
	if err != nil {
		t.Fatal(err)
	}
	defer engine.Close()
	output, err := engine.Analyze("fixture", "😀 é The report was written in order to help.\nThe the team will utilize it.")
	if err != nil {
		t.Fatal(err)
	}
	var files map[string][]struct {
		Check string
		Line  int
		Span  []int
		Match string
	}
	if err = json.Unmarshal([]byte(output), &files); err != nil {
		t.Fatal(err)
	}
	t.Log(output)
	seen := map[string]bool{}
	for _, alerts := range files {
		for _, alert := range alerts {
			if alert.Check != "write-good.Passive" && alert.Check != "write-good.TooWordy" && alert.Check != "write-good.Illusions" && alert.Check != "Microsoft.Passive" && alert.Check != "Microsoft.Wordiness" {
				t.Fatalf("unrelated rule enabled: %s", alert.Check)
			}
			seen[alert.Check] = true
			if alert.Match == "was written" && (alert.Line != 1 || !reflect.DeepEqual(alert.Span, []int{16, 26})) {
				t.Fatalf("Vale column convention changed: %#v", alert)
			}
		}
	}
	if !seen["write-good.Passive"] || !seen["write-good.TooWordy"] {
		t.Fatal("missing allowed rules", output)
	}
	if _, err = engine.Analyze("oversized", strings.Repeat("a", maxBytes+1)); err == nil {
		t.Fatal("accepted oversized input")
	}
	engine.Close()
	if _, err = engine.Analyze("closed", "text"); err == nil {
		t.Fatal("closed engine accepted work")
	}
}
