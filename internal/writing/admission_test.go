package writing

import "testing"

func TestEmbeddedAdmissionBoundsSnapshotsAndPreservesCancellation(t *testing.T) {
	for _, tc := range []struct {
		name                         string
		size                         int
		closed, cancelled, duplicate bool
		retained                     int
		want                         string
	}{
		{name: "first"},
		{name: "replacement", size: maxBytes, retained: 1},
		{name: "oversized", size: maxBytes + 1, want: "document exceeds writing analysis limit"},
		{name: "closed", closed: true, want: "writing engine is closed"},
		{name: "pre-cancelled despite full queue", cancelled: true, retained: 2, want: "context canceled"},
		{name: "duplicate", duplicate: true, want: "writing engine is busy"},
		{name: "full", retained: 2, want: "writing engine is busy"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := admitRequest(tc.size, tc.closed, tc.cancelled, tc.duplicate, tc.retained)
			got := ""
			if err != nil {
				got = err.Error()
			}
			if got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}
