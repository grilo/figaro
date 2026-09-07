package writing

import "testing"

func TestLongNoteAnalysisBudgetIsBoundedWithoutScanningText(t *testing.T) {
	for _, test := range []struct{ size, want int }{{0, 5000}, {65536, 5000}, {300000, 10000}, {4 << 20, 30000}} {
		if got := AnalysisBudgetMillis(test.size); got != test.want {
			t.Fatalf("budget(%d)=%d, want %d", test.size, got, test.want)
		}
	}
}
