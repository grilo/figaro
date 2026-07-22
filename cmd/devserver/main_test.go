package main

import "testing"

func TestDevServerAddress(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
		bad   bool
	}{
		{name: "default", want: ":34115"},
		{name: "configured", input: "34116", want: ":34116"},
		{name: "whitespace", input: " 34117 ", want: ":34117"},
		{name: "non-numeric", input: "editor", bad: true},
		{name: "out of range", input: "65536", bad: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := devServerAddress(test.input)
			if test.bad {
				if err == nil {
					t.Fatalf("devServerAddress(%q) = %q, nil; want an error", test.input, got)
				}
				return
			}
			if err != nil || got != test.want {
				t.Fatalf("devServerAddress(%q) = %q, %v; want %q, nil", test.input, got, err, test.want)
			}
		})
	}
}
