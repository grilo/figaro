package updates

import "testing"

func TestArchiveNamesMatchTheReleaseWorkflow(t *testing.T) {
	cases := map[string]string{
		ArchiveName("v1.47.0", "linux", "amd64"):   "figaro-v1.47.0-linux-amd64-update.tar.gz",
		ArchiveName("v1.47.0", "windows", "amd64"): "figaro-v1.47.0-windows-amd64-update.zip",
		ArchiveName("v1.47.0", "darwin", "arm64"):  "figaro-v1.47.0-macos-universal-update.zip",
		ArchiveName("v1.47.0", "darwin", "amd64"):  "figaro-v1.47.0-macos-universal-update.zip",
	}
	for got, want := range cases {
		if got != want {
			t.Errorf("ArchiveName = %q, want %q", got, want)
		}
	}
}

func TestMatchAssetSelectsOnlyThePlatformUpdateArchive(t *testing.T) {
	assets := []string{
		"SHA256SUMS",
		"figaro-v1.47.0-linux-amd64.tar.gz",
		"figaro-v1.47.0-linux-amd64-update.tar.gz",
		"figaro-v1.47.0-macos-universal.zip",
		"figaro-v1.47.0-macos-universal-update.zip",
		"figaro-v1.47.0-windows-amd64.zip",
		"figaro-v1.47.0-windows-amd64-update.zip",
	}
	cases := []struct {
		goos, goarch string
		want         int
	}{
		{"linux", "amd64", 2},
		{"darwin", "arm64", 4},
		{"darwin", "amd64", 4},
		{"windows", "amd64", 6},
		{"linux", "arm64", -1},
	}
	for _, tc := range cases {
		if got := MatchAsset(tc.goos, tc.goarch, assets); got != tc.want {
			t.Errorf("MatchAsset(%s/%s) = %d, want %d", tc.goos, tc.goarch, got, tc.want)
		}
	}
}

func TestMatchAssetIgnoresReleasesWithoutUpdateArchives(t *testing.T) {
	legacy := []string{"SHA256SUMS", "figaro-v1.45.0-linux-amd64.tar.gz", "figaro-v1.45.0-windows-amd64.zip"}
	if got := MatchAsset("linux", "amd64", legacy); got != -1 {
		t.Fatalf("legacy download archive selected at %d", got)
	}
}

func TestCurrentVersionRequiresAKnownProductVersion(t *testing.T) {
	if version, ok := CurrentVersion("v1.47.0"); !ok || version != "1.47.0" {
		t.Fatalf("CurrentVersion(v1.47.0) = %q, %v", version, ok)
	}
	if _, ok := CurrentVersion("  "); ok {
		t.Fatal("blank product version accepted")
	}
}

func TestPublishedPlatformsMatchTheReleaseMatrix(t *testing.T) {
	for _, platform := range [][2]string{{"linux", "amd64"}, {"windows", "amd64"}, {"darwin", "arm64"}, {"darwin", "amd64"}} {
		if !Published(platform[0], platform[1]) {
			t.Errorf("%s/%s is built by the release workflow", platform[0], platform[1])
		}
	}
	for _, platform := range [][2]string{{"linux", "arm64"}, {"windows", "arm64"}, {"freebsd", "amd64"}} {
		if Published(platform[0], platform[1]) {
			t.Errorf("%s/%s has no update archive", platform[0], platform[1])
		}
	}
}
