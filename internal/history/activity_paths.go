package history

import (
	"figaro/internal/activity"
	"fmt"
	"io"
	"os"
)

// ReadActivityPaths bounds rooted metadata reads before decoding or hashing.
func ReadActivityPaths(root *os.Root) ([]byte, error) {
	file, err := root.Open(activity.PathsFile)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, activity.MaxPathHistoryBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > activity.MaxPathHistoryBytes {
		return nil, fmt.Errorf("activity path history is too large")
	}
	return data, nil
}
