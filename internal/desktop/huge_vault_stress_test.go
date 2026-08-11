package desktop

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

type hugeVaultManifest struct {
	DocumentCount      int               `json:"documentCount"`
	SmallDocumentCount int               `json:"smallDocumentCount"`
	HugeDocumentCount  int               `json:"hugeDocumentCount"`
	HugeLineCount      int               `json:"hugeLineCount"`
	Sources            map[string]string `json:"sources"`
	Needles            map[string]string `json:"needles"`
}

type hugeVaultStressMetric struct {
	Name          string  `json:"name"`
	OperationMS   float64 `json:"operationMs"`
	SerializeMS   float64 `json:"serializeMs"`
	ResultCount   int     `json:"resultCount"`
	PayloadBytes  int     `json:"payloadBytes"`
	AllocatedByte uint64  `json:"allocatedBytes"`
	HeapAllocByte uint64  `json:"heapAllocBytes"`
}

type hugeVaultStressReport struct {
	Vault          string                  `json:"vault"`
	GoVersion      string                  `json:"goVersion"`
	Platform       string                  `json:"platform"`
	Manifest       hugeVaultManifest       `json:"manifest"`
	IndexedFiles   int                     `json:"indexedFiles"`
	SearchTrigrams int                     `json:"searchTrigrams"`
	Metrics        []hugeVaultStressMetric `json:"metrics"`
}

func loadHugeVaultManifest(t *testing.T, vaultPath string) hugeVaultManifest {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(vaultPath, ".figaro-stress-vault.json"))
	if err != nil {
		t.Fatalf("read huge-vault manifest: %v", err)
	}
	var manifest hugeVaultManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatalf("parse huge-vault manifest: %v", err)
	}
	if manifest.DocumentCount < 2 || manifest.HugeDocumentCount < 1 {
		t.Fatalf("invalid huge-vault manifest: %+v", manifest)
	}
	return manifest
}

func treeItemCount(items []*FileTreeItem) int {
	count := 0
	for _, item := range items {
		if item.Type == "file" {
			count++
		}
		count += treeItemCount(item.Children)
	}
	return count
}

func kanbanCardCount(board map[string][]KanbanCard) int {
	count := 0
	for _, cards := range board {
		count += len(cards)
	}
	return count
}

func vaultHealthIssueCount(report *VaultHealthReport) int {
	return len(report.BrokenLinks) + len(report.OrphanAttachments) + len(report.DuplicateNames) +
		len(report.SimilarNotes) + len(report.InvalidFrontmatter)
}

func recordHugeVaultMetric(
	t *testing.T,
	report *hugeVaultStressReport,
	name string,
	operation func() (any, int, error),
) any {
	t.Helper()
	var before runtime.MemStats
	runtime.ReadMemStats(&before)
	started := time.Now()
	value, resultCount, err := operation()
	operationDuration := time.Since(started)
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	serializeStarted := time.Now()
	payload, err := json.Marshal(value)
	serializeDuration := time.Since(serializeStarted)
	if err != nil {
		t.Fatalf("serialize %s: %v", name, err)
	}
	var after runtime.MemStats
	runtime.ReadMemStats(&after)
	metric := hugeVaultStressMetric{
		Name:          name,
		OperationMS:   float64(operationDuration.Microseconds()) / 1000,
		SerializeMS:   float64(serializeDuration.Microseconds()) / 1000,
		ResultCount:   resultCount,
		PayloadBytes:  len(payload),
		AllocatedByte: after.TotalAlloc - before.TotalAlloc,
		HeapAllocByte: after.HeapAlloc,
	}
	report.Metrics = append(report.Metrics, metric)
	t.Logf("stress %-30s operation=%8.1fms serialize=%7.1fms results=%6d payload=%8dB alloc=%9dB heap=%9dB",
		metric.Name, metric.OperationMS, metric.SerializeMS, metric.ResultCount,
		metric.PayloadBytes, metric.AllocatedByte, metric.HeapAllocByte)
	return value
}

// TestHugeVaultStress is an opt-in adapter benchmark against a generated real
// filesystem vault. It intentionally has no timing assertions: machines vary,
// and the emitted JSON is audit evidence rather than a flaky pass/fail budget.
func TestHugeVaultStress(t *testing.T) {
	vaultPath := os.Getenv("FIGARO_STRESS_VAULT")
	if vaultPath == "" {
		t.Skip("set FIGARO_STRESS_VAULT to a generated huge-vault fixture")
	}
	absVaultPath, err := filepath.Abs(vaultPath)
	if err != nil {
		t.Fatalf("resolve stress vault: %v", err)
	}
	manifest := loadHugeVaultManifest(t, absVaultPath)
	report := hugeVaultStressReport{
		Vault:     absVaultPath,
		GoVersion: runtime.Version(),
		Platform:  fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
		Manifest:  manifest,
		Metrics:   make([]hugeVaultStressMetric, 0),
	}

	started := time.Now()
	app := NewApp(absVaultPath)
	report.Metrics = append(report.Metrics, hugeVaultStressMetric{
		Name:        "new_app",
		OperationMS: float64(time.Since(started).Microseconds()) / 1000,
		ResultCount: 1,
	})
	t.Logf("stress %-30s operation=%8.1fms", "new_app", report.Metrics[0].OperationMS)

	treeValue := recordHugeVaultMetric(t, &report, "file_tree_cold", func() (any, int, error) {
		tree, treeErr := app.GetFileTree()
		return tree, treeItemCount(tree), treeErr
	})
	if count := treeItemCount(treeValue.([]*FileTreeItem)); count != manifest.DocumentCount {
		t.Fatalf("file tree documents = %d, want %d", count, manifest.DocumentCount)
	}

	rareValue := recordHugeVaultMetric(t, &report, "search_rare_cold_index", func() (any, int, error) {
		results, searchErr := app.SearchFiles(manifest.Needles["rare"], false)
		return results, len(results), searchErr
	})
	if count := len(rareValue.([]SearchResult)); count != manifest.HugeDocumentCount {
		t.Fatalf("rare search results = %d, want %d", count, manifest.HugeDocumentCount)
	}
	report.IndexedFiles = len(app.vaultIndex.files)
	report.SearchTrigrams = len(app.vaultIndex.searchTrigrams)

	recordHugeVaultMetric(t, &report, "search_rare_warm", func() (any, int, error) {
		results, searchErr := app.SearchFiles(manifest.Needles["rare"], false)
		return results, len(results), searchErr
	})
	commonValue := recordHugeVaultMetric(t, &report, "search_common_warm", func() (any, int, error) {
		results, searchErr := app.SearchFiles(manifest.Needles["common"], false)
		return results, len(results), searchErr
	})
	if count := len(commonValue.([]SearchResult)); count != manifest.DocumentCount {
		t.Fatalf("common search results = %d, want %d", count, manifest.DocumentCount)
	}

	boardValue := recordHugeVaultMetric(t, &report, "kanban_board_warm", func() (any, int, error) {
		board, boardErr := app.GetKanbanBoard()
		return board, kanbanCardCount(board), boardErr
	})
	if count := kanbanCardCount(boardValue.(map[string][]KanbanCard)); count != manifest.DocumentCount {
		t.Fatalf("Kanban cards = %d, want %d", count, manifest.DocumentCount)
	}
	recordHugeVaultMetric(t, &report, "home_tasks_limit_6", func() (any, int, error) {
		tasks, tasksErr := app.GetHomeTasks(6)
		return tasks, len(tasks), tasksErr
	})
	recordHugeVaultMetric(t, &report, "calendar_month_warm", func() (any, int, error) {
		month, monthErr := app.GetCalendarMonthData(2026, 8)
		count := 0
		if month != nil {
			count = len(month.DaysWithLinks)
		}
		return month, count, monthErr
	})

	recordHugeVaultMetric(t, &report, "backlinks_10000", func() (any, int, error) {
		results, backlinksErr := app.SearchBacklinks("/2026-08-11.md")
		return results, len(results), backlinksErr
	})
	recordHugeVaultMetric(t, &report, "unlinked_mentions_full_scan", func() (any, int, error) {
		results, mentionsErr := app.SearchUnlinkedMentions(manifest.Sources["huge"])
		return results, len(results), mentionsErr
	})
	recordHugeVaultMetric(t, &report, "read_huge_document", func() (any, int, error) {
		result, readErr := app.ReadFile(manifest.Sources["huge"])
		lineCount := 0
		if result != nil {
			for _, character := range result.Content {
				if character == '\n' {
					lineCount++
				}
			}
		}
		return result, lineCount, readErr
	})
	recordHugeVaultMetric(t, &report, "vault_health_warm", func() (any, int, error) {
		health, healthErr := app.GetVaultHealth()
		if healthErr != nil {
			return health, 0, healthErr
		}
		return health, vaultHealthIssueCount(health), nil
	})
	recordHugeVaultMetric(t, &report, "git_status_one_file", func() (any, int, error) {
		dirty, statusErr := app.FileHasUncommittedChanges(manifest.Sources["small"])
		return dirty, 1, statusErr
	})

	areasMoved := false
	defer func() {
		if !areasMoved {
			return
		}
		if _, cleanupErr := app.MovePath("Stress Moved/Areas", "."); cleanupErr != nil {
			t.Errorf("restore Areas after interrupted stress profile: %v", cleanupErr)
		}
	}()
	recordHugeVaultMetric(t, &report, "move_areas_directory", func() (any, int, error) {
		result, moveErr := app.MovePath("Areas", "Stress Moved")
		if moveErr == nil && (result == nil || !result.Success) {
			return result, 0, fmt.Errorf("move rejected: %+v", result)
		}
		count := 0
		if result != nil {
			count = len(result.UpdatedLinks)
		}
		if moveErr == nil {
			areasMoved = true
		}
		return result, count, moveErr
	})
	recordHugeVaultMetric(t, &report, "restore_areas_directory", func() (any, int, error) {
		result, moveErr := app.MovePath("Stress Moved/Areas", ".")
		if moveErr == nil && (result == nil || !result.Success) {
			return result, 0, fmt.Errorf("restore rejected: %+v", result)
		}
		count := 0
		if result != nil {
			count = len(result.UpdatedLinks)
		}
		if moveErr == nil {
			areasMoved = false
		}
		return result, count, moveErr
	})
	recordHugeVaultMetric(t, &report, "file_tree_warm", func() (any, int, error) {
		tree, treeErr := app.GetFileTree()
		return tree, treeItemCount(tree), treeErr
	})

	if report.IndexedFiles != manifest.DocumentCount {
		t.Fatalf("indexed files = %d, want %d", report.IndexedFiles, manifest.DocumentCount)
	}
	if reportPath := os.Getenv("FIGARO_STRESS_REPORT"); reportPath != "" {
		if err := os.MkdirAll(filepath.Dir(reportPath), 0755); err != nil {
			t.Fatalf("create stress report directory: %v", err)
		}
		data, err := json.MarshalIndent(report, "", "  ")
		if err != nil {
			t.Fatalf("encode stress report: %v", err)
		}
		if err := os.WriteFile(reportPath, append(data, '\n'), 0644); err != nil {
			t.Fatalf("write stress report: %v", err)
		}
		t.Logf("stress report: %s", reportPath)
	}
}
