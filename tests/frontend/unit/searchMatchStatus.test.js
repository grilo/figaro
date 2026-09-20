import { EditorState } from '@codemirror/state';
import { SearchQuery, search, setSearchQuery } from '@codemirror/search';
import { editorSearchMatchSummary } from '../../../frontend/js/searchMatchStatus.js';

function queryState(doc, query) {
    return EditorState.create({ doc, extensions: [search()] }).update({ effects: setSearchQuery.of(query) }).state;
}

test('Find selection summaries reuse matches until the document or query changes', () => {
    for (const count of [10, 1000]) {
        let state = queryState(Array(count).fill('needle').join(' '), new SearchQuery({ search: 'needle' }));
        const read = jest.spyOn(SearchQuery.prototype, 'getCursor');
        try {
            expect(editorSearchMatchSummary(state)).toBe(`${count} matches`);
            read.mockClear();
            for (let index = 0; index < 20; index++) {
                state = state.update({ selection: { anchor: index % count * 7, head: index % count * 7 + 6 } }).state;
                expect(editorSearchMatchSummary(state)).toBe(`${index % count + 1} of ${count} matches`);
            }
            expect(read).not.toHaveBeenCalled();
            state = state.update({ changes: { from: 0, to: 6, insert: 'other' }, selection: { anchor: 0 } }).state;
            expect(editorSearchMatchSummary(state)).toBe(`${count - 1} matches`);
            expect(read).toHaveBeenCalledTimes(1);
            state = state.update({ effects: setSearchQuery.of(new SearchQuery({ search: 'other' })) }).state;
            expect(editorSearchMatchSummary(state)).toBe('1 match');
            expect(read).toHaveBeenCalledTimes(2);
        } finally { read.mockRestore(); }
    }
});

test('Find cache respects regex, case, whole words, empty matches and invalid queries', () => {
    let state = queryState('Word word sword', new SearchQuery({ search: 'word' }));
    expect(editorSearchMatchSummary(state)).toBe('3 matches');
    for (const [query, expected] of [
        [{ search: 'word', caseSensitive: true }, '2 matches'],
        [{ search: 'word', caseSensitive: true, wholeWord: true }, '1 match'],
        [{ search: '^|$', regexp: true }, '1 of 2 matches'],
        [{ search: '[', regexp: true }, 'Invalid search pattern'],
        [{ search: '' }, ''],
    ]) {
        state = state.update({ effects: setSearchQuery.of(new SearchQuery(query)) }).state;
        expect(editorSearchMatchSummary(state)).toBe(expected);
    }
});

test('whole-word language boundaries and state-dependent query predicates invalidate cached matches', () => {
    let state = EditorState.create({ doc: 'foo-bar foo', extensions: [search(),
        EditorState.languageData.of((_state, position) => [{ wordChars: position < 5 ? '-' : '' }]),
    ] }).update({ effects: setSearchQuery.of(new SearchQuery({ search: 'foo', wholeWord: true })) }).state;
    expect(editorSearchMatchSummary(state)).toBe('1 match');
    state = state.update({ selection: { anchor: 8 } }).state;
    expect(editorSearchMatchSummary(state)).toBe('2 matches');
    state = state.update({ effects: setSearchQuery.of(new SearchQuery({ search: 'foo',
        test: (_match, current, from) => from >= current.selection.main.head,
    })) }).state;
    expect(editorSearchMatchSummary(state)).toBe('1 match');
    state = state.update({ selection: { anchor: 0 } }).state;
    expect(editorSearchMatchSummary(state)).toBe('2 matches');
});
