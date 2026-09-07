package main

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"fmt"
	"testing"
)

func TestWritingAssetsVerifyBeforeExtractingOnlyThePinnedExecutable(t *testing.T) {
	for _, format := range []string{"tar.gz", "zip"} {
		t.Run(format, func(t *testing.T) {
			var archive bytes.Buffer
			if format == "zip" {
				writer := zip.NewWriter(&archive)
				for _, name := range []string{"../vale.exe", "vale.exe"} {
					entry, _ := writer.Create(name)
					_, _ = entry.Write([]byte(name))
				}
				if err := writer.Close(); err != nil {
					t.Fatal(err)
				}
			} else {
				compressed := gzip.NewWriter(&archive)
				writer := tar.NewWriter(compressed)
				for _, name := range []string{"../vale", "vale"} {
					_ = writer.WriteHeader(&tar.Header{Name: name, Size: int64(len(name)), Mode: 0700})
					_, _ = writer.Write([]byte(name))
				}
				if err := writer.Close(); err != nil {
					t.Fatal(err)
				}
				if err := compressed.Close(); err != nil {
					t.Fatal(err)
				}
			}
			item := asset{Name: "release." + format, SHA: fmt.Sprintf("%x", sha256.Sum256(archive.Bytes()))}
			binary, err := verifiedExecutable(archive.Bytes(), item)
			want := "vale"
			if format == "zip" {
				want += ".exe"
			}
			if err != nil || string(binary) != want {
				t.Fatalf("wrong executable: %q %v", binary, err)
			}
			if _, err := verifiedExecutable(append(archive.Bytes(), 0), item); err == nil {
				t.Fatal("accepted a checksum mismatch")
			}
		})
	}
	if _, err := executable([]byte("not an archive"), "release.zip"); err == nil {
		t.Fatal("accepted corrupt archive")
	}
	if err := prepare("unsupported/target"); err == nil {
		t.Fatal("accepted unsupported target")
	}
}
