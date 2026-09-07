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
