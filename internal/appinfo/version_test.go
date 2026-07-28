package appinfo

import "testing"

func TestProductVersionExtractsStableWailsMetadata(t *testing.T) {
	version, err := ProductVersion([]byte(`{"info":{"productVersion":" 1.7.0 "}}`))
	if err != nil {
		t.Fatalf("ProductVersion returned an error: %v", err)
	}
	if version != "1.7.0" {
		t.Fatalf("ProductVersion = %q, want %q", version, "1.7.0")
	}
}

func TestProductVersionRejectsMissingMalformedAndPrereleaseMetadata(t *testing.T) {
	for name, configuration := range map[string]string{
		"malformed JSON":  `{`,
		"missing version": `{"info":{}}`,
		"prerelease":      `{"info":{"productVersion":"1.7.0-rc.1"}}`,
	} {
		t.Run(name, func(t *testing.T) {
			if version, err := ProductVersion([]byte(configuration)); err == nil {
				t.Fatalf("ProductVersion = %q without an error", version)
			}
		})
	}
}
