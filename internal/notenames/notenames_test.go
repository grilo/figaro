package notenames

import "testing"

func TestCanonicalMarkdownName(t *testing.T) {
	tests := map[string]string{
		"notes/InnerSource.md":   "innersource",
		"notes/Inner Source!.MD": "innersource",
		"notes/Ｉｎｎｅｒ-Ｓｏｕｒｃｅ.md":  "innersource",
		"notes/C++.md":           "",
		"notes/InnerSource.txt":  "",
	}
	for input, want := range tests {
		if got := CanonicalMarkdownName(input); got != want {
			t.Errorf("CanonicalMarkdownName(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestSubstantialContentOverlapIsConservative(t *testing.T) {
	left := "Architecture teams document ownership boundaries dependencies testing releases security performance and maintenance."
	right := "Architecture teams document ownership boundaries dependencies testing releases security performance and delivery."
	if !SubstantialContentOverlap(left, right) {
		t.Fatal("expected substantial shared vocabulary to match")
	}
	if SubstantialContentOverlap("milk bread eggs", "hammer nails paint") {
		t.Fatal("short unrelated notes must not match")
	}
	if SubstantialContentOverlap(
		"architecture teams document ownership boundaries dependencies testing releases security performance",
		"holiday flights hotels beaches museums restaurants tickets packing weather transport",
	) {
		t.Fatal("different substantial notes must not match")
	}
}
