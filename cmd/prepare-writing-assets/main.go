// Build-time download and checksum verification; never called by the application.
package main

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type asset struct{ Name, SHA string }

var assets = map[string]asset{
	"linux/amd64":   {"Linux_64-bit.tar.gz", "f59e7030c5d4ace6cf915497d0d076a1699d61e876142765963237e6867c9712"},
	"linux/arm64":   {"Linux_arm64.tar.gz", "d49e89479a40dbe6a6fe44a2963abef0ee39d89453f3c7100bdd1c5dd0708961"},
	"windows/amd64": {"Windows_64-bit.zip", "189b3511813a428f08a2be0d7692e50dd6e90dd81b2f8e04dbfbfe42cafd9980"},
	"windows/arm64": {"Windows_arm64.zip", "397cf247252f205145c991b339031a39d02d947d97ac48e6516bb62118ed411f"},
	"darwin/amd64":  {"macOS_64-bit.tar.gz", "8d51cbe9ca6274fade890fc943b30dc564071dcb8fd8814abce2d0dca37fbba7"},
	"darwin/arm64":  {"macOS_arm64.tar.gz", "6b32df1a7d7b2ab01c07c1c4dd5fd84d775ac7a8f4101084cb5cc7df76bdc65e"},
}

func executable(data []byte, name string) ([]byte, error) {
	if strings.HasSuffix(name, ".zip") {
		reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			return nil, err
		}
		for _, entry := range reader.File {
			if entry.Name == "vale.exe" {
				r, err := entry.Open()
				if err != nil {
					return nil, err
				}
				defer r.Close()
				return io.ReadAll(io.LimitReader(r, 150<<20))
			}
		}
	} else {
		reader, err := gzip.NewReader(bytes.NewReader(data))
		if err != nil {
			return nil, err
		}
		defer reader.Close()
		archive := tar.NewReader(reader)
		for {
			entry, err := archive.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return nil, err
			}
			if entry.Name == "vale" {
				return io.ReadAll(io.LimitReader(archive, 150<<20))
			}
		}
	}
	return nil, fmt.Errorf("archive has no Vale executable")
}

func verifiedExecutable(data []byte, asset asset) ([]byte, error) {
	if fmt.Sprintf("%x", sha256.Sum256(data)) != asset.SHA {
		return nil, fmt.Errorf("Vale checksum mismatch")
	}
	return executable(data, asset.Name)
}

func prepare(target string) error {
	asset, ok := assets[target]
	if !ok {
		return fmt.Errorf("unsupported target %s", target)
	}
	path := filepath.Join("internal", "writing", "assets", "vale-3.20.0-"+strings.ReplaceAll(target, "/", "-")+".gz")
	if info, err := os.Stat(path); err == nil && info.Size() > 0 {
		return nil
	}
	url := "https://github.com/vale-cli/vale/releases/download/v3.20.0/vale_3.20.0_" + asset.Name
	client := &http.Client{Timeout: 120 * time.Second}
	response, err := client.Get(url)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return fmt.Errorf("Vale download: %s", response.Status)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 100<<20))
	if err != nil {
		return err
	}
	binary, err := verifiedExecutable(data, asset)
	if err != nil {
		return err
	}
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	if _, err = writer.Write(binary); err != nil {
		return err
	}
	if err = writer.Close(); err != nil {
		return err
	}
	if err = os.WriteFile(path+".tmp", compressed.Bytes(), 0600); err != nil {
		return err
	}
	if err = os.Rename(path+".tmp", path); err != nil {
		return err
	}
	fmt.Printf("Prepared Vale 3.20.0 for %s (%d compressed bytes)\n", target, compressed.Len())
	return nil
}
func main() {
	target := flag.String("target", runtime.GOOS+"/"+runtime.GOARCH, "target OS/architecture, or darwin/universal")
	flag.Parse()
	targets := []string{*target}
	if *target == "darwin/universal" || *target == "darwin/"+runtime.GOARCH {
		targets = []string{"darwin/amd64", "darwin/arm64"}
	}
	for _, target := range targets {
		if err := prepare(target); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
}
