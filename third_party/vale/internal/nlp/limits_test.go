package nlp

import (
	"strings"
	"testing"
)

func TestEmbeddedParagraphBlockLimitRejectsDenseDocuments(t *testing.T) {
	info := Info{Splitting: true}
	block := NewBlock("", strings.Repeat("word\n\n", 65537), "text.txt")
	if blocks, err := info.Compute(&block, true); err == nil || blocks != nil || !strings.Contains(err.Error(), "block limit") {
		t.Fatalf("expected block limit, got %d blocks and %v", len(blocks), err)
	}
}
