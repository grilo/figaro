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
