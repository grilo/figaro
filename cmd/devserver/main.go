package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
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

func main() {
	address, err := devServerAddress(os.Getenv("FIGARO_DEVSERVER_PORT"))
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("Dev server: http://localhost%s", address)
	server := &http.Server{
		Addr:              address,
		Handler:           withDisabledAssetCache(http.FileServer(http.Dir("frontend"))),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Fatal(server.ListenAndServe())
}
