// Developer-only JSON-lines harness for the production writing adapter.
package main

import (
	"encoding/json"
	"errors"
	"figaro/internal/writing"
	"fmt"
	"io"
	"os"
	"time"
)

func main() {
	started := time.Now()
	engine, err := writing.Open()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer engine.Close()
	encoder, decoder := json.NewEncoder(os.Stdout), json.NewDecoder(os.Stdin)
	if err := encoder.Encode(map[string]any{"ready": true, "initializationMs": float64(time.Since(started).Microseconds()) / 1000}); err != nil {
		return
	}
	for {
		var request struct{ ID, Text string }
		if err := decoder.Decode(&request); err != nil {
			if !errors.Is(err, io.EOF) {
				fmt.Fprintln(os.Stderr, err)
			}
			return
		}
		output, err := engine.Analyze(request.ID, request.Text)
		response := map[string]any{"id": request.ID, "output": output}
		if err != nil {
			response["error"] = err.Error()
		}
		if err := encoder.Encode(response); err != nil {
			return
		}
	}
}
