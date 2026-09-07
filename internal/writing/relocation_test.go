package writing

import (
	"errors"
	"reflect"
	"testing"
)

func TestWritingRelocationRollsBackBothFilesIncludingUncertainWrite(t *testing.T) {
	stored := map[string]string{"lenses": "old choices", "decisions": "old ignore"}
	calls := []string{}
	changes := []MetadataChange{{"lenses", []byte(stored["lenses"]), []byte("new choices")}, {"decisions", []byte(stored["decisions"]), []byte("new ignore")}}
	_, err := ApplyMetadataMove(changes, func(path string, data []byte) error {
		calls = append(calls, path)
		stored[path] = string(data)
		if path == "decisions" && string(data) == "new ignore" {
			return errors.New("uncertain save")
		}
		return nil
	})
	if err == nil || !reflect.DeepEqual(calls, []string{"lenses", "decisions", "decisions", "lenses"}) || stored["lenses"] != "old choices" || stored["decisions"] != "old ignore" {
		t.Fatalf("rollback: %v %v %v", stored, calls, err)
	}
}
func TestWritingRelocationProvidesRollbackForFailedFilesystemRename(t *testing.T) {
	stored := "old"
	rollback, err := ApplyMetadataMove([]MetadataChange{{"choices", []byte("old"), []byte("new")}}, func(_ string, data []byte) error { stored = string(data); return nil })
	if err != nil || stored != "new" {
		t.Fatal(err, stored)
	}
	if err = rollback(); err != nil || stored != "old" {
		t.Fatal(err, stored)
	}
}
