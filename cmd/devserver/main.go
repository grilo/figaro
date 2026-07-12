package main

import (
	"log"
	"net/http"
	"time"
)

func main() {
	log.Println("Dev server: http://localhost:34115")
	server := &http.Server{
		Addr:              ":34115",
		Handler:           http.FileServer(http.Dir("frontend")),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Fatal(server.ListenAndServe())
}
