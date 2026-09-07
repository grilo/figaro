package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const defaultDevServerPort = "34115"

func devServerAddress(portValue string) (string, error) {
	port := strings.TrimSpace(portValue)
	if port == "" {
		port = defaultDevServerPort
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return "", fmt.Errorf("FIGARO_DEVSERVER_PORT must be a port from 1 to 65535, got %q", portValue)
	}
	return ":" + port, nil
}

func withDisabledAssetCache(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(response, request)
	})
}

func developmentAssetHandler(root string) http.Handler {
	files := http.FileServer(http.Dir(root))
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/" && request.URL.Path != "/index.html" {
			files.ServeHTTP(response, request)
			return
		}
		index, err := os.ReadFile(filepath.Join(root, "index.html"))
		if err != nil {
			http.Error(response, "development entry point unavailable", http.StatusInternalServerError)
			return
		}
		response.Header().Set("Content-Type", "text/html; charset=utf-8")
		entry := string(index)
		if request.URL.Query().Get("figaro-entry") != "production" {
			entry = strings.Replace(
				entry,
				`<script type="module" src="/app.bundle.js"></script>`,
				`<script type="module" src="/js/bootstrap.js"></script>`,
				1,
			)
		}
		_, _ = response.Write([]byte(entry))
	})
}

func main() {
	address, err := devServerAddress(os.Getenv("FIGARO_DEVSERVER_PORT"))
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("Dev server: http://localhost%s", address)
	server := &http.Server{
		Addr:              address,
		Handler:           withDisabledAssetCache(developmentAssetHandler("frontend")),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Fatal(server.ListenAndServe())
}
