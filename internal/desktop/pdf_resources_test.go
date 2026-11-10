package desktop

import (
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	goruntime "runtime"
	"strings"
	"testing"
)

func TestLocalPathOfFileURLAcceptsOnlyFilesOnThisComputer(t *testing.T) {
	for _, test := range []struct {
		goos, requestURL string
		want             string
		local            bool
	}{
		{"linux", "file:///home/writer/Vault/pic.png", "/home/writer/Vault/pic.png", true},
		{"linux", "file:///home/writer/Vault/My%20Notes/pic%231.png?v=2#frag", "/home/writer/Vault/My Notes/pic#1.png", true},
		{"linux", "file://localhost/home/writer/pic.png", "/home/writer/pic.png", true},
		{"darwin", "file:///Users/writer/Vault/pic.png", "/Users/writer/Vault/pic.png", true},
		{"linux", "file://fileserver/share/pic.png", "", false},
		{"linux", "file:relative/pic.png", "", false},
		{"linux", "file:///home/writer/pic%00.png", "", false},
		{"windows", "file:///C:/Users/writer/Vault/pic.png", "C:/Users/writer/Vault/pic.png", true},
		{"windows", "file:///c:/Users/writer/Vault/My%20Notes/pic.png", "c:/Users/writer/Vault/My Notes/pic.png", true},
		{"windows", "file://fileserver/share/pic.png", "", false},
		{"windows", "file:///Users/writer/pic.png", "", false},
		{"windows", "file:///1:/pic.png", "", false},
	} {
		parsed, err := url.Parse(test.requestURL)
		if err != nil {
			t.Fatalf("parse %q: %v", test.requestURL, err)
		}
		got, local := localPathOfFileURL(test.goos, parsed)
		if got != test.want || local != test.local {
			t.Errorf("localPathOfFileURL(%s, %q) = %q, %v; want %q, %v", test.goos, test.requestURL, got, local, test.want, test.local)
		}
	}
}

func TestPDFResourceDecisionPermitsOnlyInlineDataAndFilesInsideTheRoots(t *testing.T) {
	roots := []string{filepath.FromSlash("/vault"), filepath.FromSlash("/tmp/figaro-pdf-1")}
	// The fake resolver stands in for the filesystem: one link leaves the
	// vault, one stays inside it, and one path does not exist.
	resolve := func(path string) (string, error) {
		switch filepath.ToSlash(path) {
		case "/vault/escape.png":
			return filepath.FromSlash("/home/writer/.ssh/id_ed25519"), nil
		case "/vault/alias.png":
			return filepath.FromSlash("/vault/assets/real.png"), nil
		case "/vault/missing.png":
			return "", os.ErrNotExist
		}
		return filepath.Clean(path), nil
	}
	for _, test := range []struct {
		requestURL string
		want       pdfResourceVerdict
	}{
		{"file:///vault/Notes/pic.png", pdfResourcePermitted},
		{"file:///vault/print.css", pdfResourcePermitted},
		{"file:///vault", pdfResourcePermitted},
		{"file:///tmp/figaro-pdf-1/document.html", pdfResourcePermitted},
		{"file:///tmp/figaro-pdf-1/katex-fonts/KaTeX_Main-Regular.woff2", pdfResourcePermitted},
		{"file:///vault/alias.png", pdfResourcePermitted},
		{"data:image/png;base64,AAAA", pdfResourcePermitted},
		{"about:blank", pdfResourcePermitted},

		{"file:///etc/passwd", pdfResourceOutside},
		{"file:///home/writer/.ssh/id_ed25519", pdfResourceOutside},
		{"file:///vault/../etc/passwd", pdfResourceOutside},
		{"file:///vault/%2e%2e/etc/passwd", pdfResourceOutside},
		{"file:///vault-backup/pic.png", pdfResourceOutside},
		{"file:///tmp/figaro-pdf-2/document.html", pdfResourceOutside},
		{"file:///vault/escape.png", pdfResourceOutside},
		{"file://fileserver/vault/pic.png", pdfResourceOutside},
		{"file:///", pdfResourceOutside},

		{"file:///vault/missing.png", pdfResourceRefused},
		{"https://example.com/pic.png", pdfResourceRefused},
		{"http://127.0.0.1:8080/pic.png", pdfResourceRefused},
		{"about:srcdoc", pdfResourceRefused},
		{"blob:null/1234", pdfResourceRefused},
		{"javascript:alert(1)", pdfResourceRefused},
		{"chrome://settings", pdfResourceRefused},
		{"://not a url", pdfResourceRefused},
		{"", pdfResourceRefused},
	} {
		if got := pdfResourceDecision("linux", test.requestURL, roots, resolve); got != test.want {
			t.Errorf("pdfResourceDecision(%q) = %d, want %d", test.requestURL, got, test.want)
		}
	}
	failing := func(string) (string, error) { return "", errors.New("cannot resolve") }
	if got := pdfResourceDecision("linux", "file:///vault/pic.png", roots, failing); got != pdfResourceRefused {
		t.Errorf("an unresolvable path was not refused: %d", got)
	}
}

// The guard on a real folder tree: location is judged after symbolic links
// are followed, for the vault root itself and for every file asked about.
func TestPDFResourceGuardFollowsSymbolicLinksOnDisk(t *testing.T) {
	if goruntime.GOOS == "windows" {
		t.Skip("file URLs and symbolic links below are in their Unix forms")
	}
	base := t.TempDir()
	vault := filepath.Join(base, "vault")
	workspace := filepath.Join(base, "workspace")
	outside := filepath.Join(base, "outside")
	for _, directory := range []string{filepath.Join(vault, "assets"), workspace, outside} {
		if err := os.MkdirAll(directory, 0755); err != nil {
			t.Fatal(err)
		}
	}
	write := func(path string) string {
		t.Helper()
		if err := os.WriteFile(path, []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
		return path
	}
	inside := write(filepath.Join(vault, "assets", "pic.png"))
	document := write(filepath.Join(workspace, "document.html"))
	secret := write(filepath.Join(outside, "secret.png"))
	vaultAlias := filepath.Join(base, "vault-alias")
	fileEscape := filepath.Join(vault, "assets", "escape.png")
	folderEscape := filepath.Join(vault, "linked")
	insideAlias := filepath.Join(vault, "alias.png")
	for link, target := range map[string]string{
		vaultAlias:   vault,
		fileEscape:   secret,
		folderEscape: outside,
		insideAlias:  inside,
	} {
		if err := os.Symlink(target, link); err != nil {
			t.Skipf("symbolic links unavailable: %v", err)
		}
	}

	// The vault is named through a link, as a vault in a linked home folder is.
	guard, err := newPDFResourceGuard(vaultAlias, workspace)
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{inside, document, insideAlias, filepath.Join(vaultAlias, "assets", "pic.png")} {
		if !guard.allow(localFileURL(path, false)) {
			t.Errorf("a file inside the vault or workspace was refused: %s", path)
		}
	}
	refused := []string{
		localFileURL(secret, false),
		localFileURL(fileEscape, false),
		localFileURL(filepath.Join(folderEscape, "secret.png"), false),
		localFileURL(vault, true) + "../outside/secret.png",
	}
	for _, requestURL := range refused {
		if guard.allow(requestURL) {
			t.Errorf("a file outside the vault was allowed: %s", requestURL)
		}
	}
	// A broken link is refused without being reported as outside the vault.
	if guard.allow(localFileURL(filepath.Join(vault, "assets", "missing.png"), false)) {
		t.Error("a missing file was allowed")
	}
	// Asking twice, as a two-pass export does, reports each file once.
	guard.allow(refused[0])
	if got := guard.blockedResources(); !reflect.DeepEqual(got, refused) {
		t.Fatalf("blocked resources = %v, want %v", got, refused)
	}

	if _, err := newPDFResourceGuard(filepath.Join(base, "no-such-folder")); err == nil {
		t.Fatal("a guard was built for a folder that does not exist")
	}
}

func TestPDFBlockedResourceWarningNamesWhatWasLeftOut(t *testing.T) {
	if got := pdfBlockedResourceWarning(nil); got != "" {
		t.Fatalf("warning without blocked files = %q", got)
	}
	one := pdfBlockedResourceWarning([]string{"file:///home/writer/Pictures/My%20Photo.png"})
	if !strings.Contains(one, "without a file") || !strings.Contains(one, "“My Photo.png”") || strings.Contains(one, "/home/writer") {
		t.Fatalf("warning for one file = %q", one)
	}
	many := pdfBlockedResourceWarning([]string{
		"file:///a/one.png", "file:///b/two.css", "file:///c/three.woff2", "file:///d/four.png", "file:///e/five.png",
	})
	for _, want := range []string{"without 5 files", "“one.png”, “two.css”, “three.woff2” and 2 more", "Copy them into the vault"} {
		if !strings.Contains(many, want) {
			t.Fatalf("warning for five files = %q, want it to contain %q", many, want)
		}
	}
}
