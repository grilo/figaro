package repositorycheck

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

func TestTagTriggeredReleaseWorkflowBuildsAndPublishesAllSupportedPlatforms(t *testing.T) {
	workflowBytes, err := os.ReadFile(".github/workflows/release.yml")
	if err != nil {
		t.Fatal(err)
	}
	workflow := string(workflowBytes)

	requiredContracts := map[string]string{
		"stable semantic-version tag trigger": "- 'v[0-9]+.[0-9]+.[0-9]+'",
		"tag validation":                      "^v[0-9]+\\.[0-9]+\\.[0-9]+$",
		"main ancestry guard":                 "git merge-base --is-ancestor \"$GITHUB_SHA\" origin/main",
		"release verification dependency":     "needs: verify",
		"Linux native runner":                 "os: ubuntu-24.04",
		"Windows native runner":               "os: windows-latest",
		"macOS native runner":                 "os: macos-latest",
		"Linux Wails target":                  "./scripts/package-desktop.sh linux",
		"Windows Wails target":                "./scripts/package-desktop.sh windows",
		"universal macOS Wails target":        "./scripts/package-desktop.sh darwin",
		"Linux GTK4 WebKit dependencies":      "libgtk-4-dev libwebkitgtk-6.0-dev",
		"Linux update archive":                `tar -C build/bin -czf "dist/$archive-update.tar.gz" figaro`,
		"Windows update archive":              `Compress-Archive -Path build/bin/figaro.exe -DestinationPath "dist/$archive-update.zip"`,
		"macOS update archive":                `ditto -c -k --sequesterRsrc --keepParent build/bin/figaro.app "dist/$archive-update.zip"`,
		"tag-derived expected version":        "const expected = process.env.GITHUB_REF_NAME.slice(1)",
		"package version validation":          `"package.json": pkg.version`,
		"lockfile version validation":         `"package-lock root package": lock.packages?.[""]?.version`,
		"Wails version validation":            `"wails.json": wails.info?.productVersion`,
		"GPL metadata validation":             `license !== "GPL-3.0-or-later"`,
		"Linux release archive":               `archive="figaro-${GITHUB_REF_NAME}-linux-amd64"`,
		"Windows release archive":             `$archive = "figaro-$($env:GITHUB_REF_NAME)-windows-amd64"`,
		"macOS release archive":               `archive="figaro-${GITHUB_REF_NAME}-macos-universal"`,
		"Linux and macOS release documents":   "cp README.md CHANGELOG.md LICENSE",
		"Windows release documents":           "Copy-Item README.md, CHANGELOG.md, LICENSE",
		"release checksum manifest":           "sha256sum figaro-*.tar.gz figaro-*.zip > SHA256SUMS",
		"narrow release permission":           "contents: write",
		"explicit release repository":         "GH_REPO: ${{ github.repository }}",
		"GitHub release creation":             "gh release create \"$GITHUB_REF_NAME\" dist/*",
		"rerun-safe asset repair":             "gh release upload \"$GITHUB_REF_NAME\" dist/* --clobber",
		"publish waits for all builds":        "needs: build",
	}
	for name, fragment := range requiredContracts {
		t.Run(name, func(t *testing.T) {
			if !strings.Contains(workflow, fragment) {
				t.Fatalf("release workflow is missing %s (%q)", name, fragment)
			}
		})
	}

	if strings.Contains(workflow, "workflow_dispatch:") || strings.Contains(workflow, "branches:") {
		t.Fatal("release workflow must be triggered only by a stable version tag push")
	}
	if strings.Contains(workflow, "fs.writeFileSync") {
		t.Fatal("release workflow must validate checked-in metadata rather than mutating it during the build")
	}
}

func TestReleaseWorkflowPinsTheWailsVersionRequiredByGoMod(t *testing.T) {
	workflowBytes, err := os.ReadFile(".github/workflows/release.yml")
	if err != nil {
		t.Fatal(err)
	}
	goModBytes, err := os.ReadFile("go.mod")
	if err != nil {
		t.Fatal(err)
	}

	match := regexp.MustCompile(`github\.com/wailsapp/wails/v3\s+(v[^\s]+)`).FindSubmatch(goModBytes)
	if len(match) != 2 {
		t.Fatal("go.mod does not declare a Wails v3 version")
	}
	want := "WAILS_VERSION: " + string(match[1])
	if !strings.Contains(string(workflowBytes), want) {
		t.Fatalf("release workflow must contain %q", want)
	}
}

func TestWailsV3NeedsNoForkedHost(t *testing.T) {
	goModBytes, err := os.ReadFile("go.mod")
	if err != nil {
		t.Fatal(err)
	}
	// Wails v2 reposted unhandled WebView2 accelerator keys to the native
	// window, which broke Windows AltGr dead keys and needed a fork. v3 only
	// consumes accelerators bound to a menu item or key binding, and Figaro
	// registers none, so the module must come from upstream.
	if strings.Contains(string(goModBytes), "github.com/wailsapp/wails/v2") || strings.Contains(string(goModBytes), "replace github.com/wailsapp/wails") {
		t.Fatal("go.mod must use upstream Wails v3 without a replacement")
	}
}

func TestHostedReleaseCanGenerateIconsWithUbuntuImageMagick(t *testing.T) {
	scriptBytes, err := os.ReadFile("scripts/generate-icons.sh")
	if err != nil {
		t.Fatal(err)
	}
	script := string(scriptBytes)
	for _, fragment := range []string{
		"command -v magick",
		"command -v convert",
		"convert -version 2>&1 | grep -q 'ImageMagick'",
		`"${image_magick[@]}"`,
	} {
		if !strings.Contains(script, fragment) {
			t.Fatalf("icon generator is missing hosted-runner fallback %q", fragment)
		}
	}
}
