package main

import (
	"embed"
	"log"
	"os"

	"figaro/internal/desktop"
)

// Keep the frontend and product metadata at the executable boundary. Go embed
// patterns cannot reach into a parent directory, so the composition root owns
// the bytes and passes them to the internal desktop application.
//
//go:embed all:frontend
var assets embed.FS

//go:embed wails.json
var wailsConfiguration []byte

func main() {
	if err := desktop.Run(assets, wailsConfiguration, os.Args[1:]); err != nil {
		log.Fatal(err)
	}
}
