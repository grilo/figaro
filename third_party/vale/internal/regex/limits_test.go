package regex

import (
	"strings"
	"testing"
)

func TestEmbeddedMatchLimitRejectsDenseInputWithoutTruncatingMatches(t *testing.T) {
	re := MustCompile("x")
	func() {
		defer func() {
			if err := recover(); err == nil || !strings.Contains(err.(error).Error(), "match limit") {
				t.Fatalf("expected match limit, got %v", err)
			}
		}()
		re.FindAllString(strings.Repeat("x", 65537), -1)
	}()
	if got := re.FindAllString("x", -1); len(got) != 1 {
		t.Fatal("limit damaged reusable expression")
	}
}
