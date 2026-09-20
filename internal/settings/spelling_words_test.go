package settings

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestSpellingDictionaryPlansPreserveUnknownFieldsAndNormalizeDuplicates(t *testing.T) {
	data, words, err := AddSpellingWord([]byte(`{"version":1,"words":["Figaro","figaro"],"future":{"keep":true}}`), " O’Reilly ")
	if err != nil || !reflect.DeepEqual(words, []string{"figaro", "o'reilly"}) {
		t.Fatalf("words = %v, %v", words, err)
	}
	var record map[string]json.RawMessage
	if json.Unmarshal(data, &record) != nil || string(record["future"]) == "" {
		t.Fatal("lost unknown fields")
	}
	for _, invalid := range []string{"", "null", "{}", `{"version":2,"words":[]}`, `{"version":1,"words":null}`, `{"version":1,"words":["two words"]}`} {
		if _, _, err := AddSpellingWord([]byte(invalid), "figaro"); err == nil {
			t.Fatalf("accepted invalid file %q", invalid)
		}
	}
	for _, word := range []string{"", "two words", "../path", "hello\nworld"} {
		if _, _, err := AddSpellingWord(nil, word); err == nil {
			t.Fatalf("accepted invalid word %q", word)
		}
	}
}

func TestSpellingDictionaryAcceptsPossessivesAndCanonicalUnicode(t *testing.T) {
	data := []byte(`{"version":1,"words":["café"],"future":{"keep":true}}`)
	for _, word := range []string{"CAFÉ", "glinter’s", "glinters’", "glinters'"} {
		next, _, err := AddSpellingWord(data, word)
		if err != nil {
			t.Fatalf("add %q: %v", word, err)
		}
		data = next
	}
	record, words, err := ReadSpellingWords(data)
	if err != nil || !reflect.DeepEqual(words, []string{"café", "glinter's", "glinters'"}) {
		t.Fatalf("words = %v, %v", words, err)
	}
	var future map[string]bool
	if json.Unmarshal(record["future"], &future) != nil || !future["keep"] {
		t.Fatal("lost unknown fields")
	}
	for _, word := range []string{"glinter'", "glinters''", "glinter's'", "two words'", "'"} {
		if _, _, err := AddSpellingWord(data, word); err == nil {
			t.Fatalf("accepted malformed word %q", word)
		}
	}
}

func TestSpellingDictionaryRemoveNormalizesAndPreservesMetadata(t *testing.T) {
	data := []byte(`{"version":1,"words":["café","figaro"],"future":{"keep":true}}`)
	next, words, err := RemoveSpellingWord(data, "CAFE\u0301")
	if err != nil || len(words) != 1 || words[0] != "figaro" {
		t.Fatalf("remove = %s %v %v", next, words, err)
	}
	record, _, err := ReadSpellingWords(next)
	if err != nil || string(record["future"]) != "{\n    \"keep\": true\n  }" {
		t.Fatalf("metadata = %s %v", record["future"], err)
	}
	for _, invalid := range []string{`{"version":9,"words":[]}`, `{broken`} {
		if _, _, err := RemoveSpellingWord([]byte(invalid), "figaro"); err == nil {
			t.Fatal("accepted invalid file")
		}
	}
	if _, _, err := RemoveSpellingWord(data, "two words"); err == nil {
		t.Fatal("accepted invalid word")
	}
	_, words, err = RemoveSpellingWord(nil, "absent")
	if err != nil || len(words) != 0 {
		t.Fatalf("missing = %v %v", words, err)
	}
}
