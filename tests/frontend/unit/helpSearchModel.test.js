import { helpSearchResults } from '../frontend/js/core/helpSearchModel.js';

const entries = [
    { title: 'Emphasis', category: 'Help · Markdown', detail: '**bold** *italic*' },
    { title: 'Vim mode', category: 'Settings · Editor', keywords: ['vi', 'motions'] },
    { title: 'Auto-save', category: 'Settings · Automation', keywords: ['interval'] },
];

describe('help search model', () => {
    test('finds syntax and Settings keywords without executing anything', () => {
        expect(helpSearchResults('bold', entries).map(entry => entry.title)).toEqual(['Emphasis']);
        expect(helpSearchResults('vim', entries).map(entry => entry.title)).toEqual(['Vim mode']);
        expect(helpSearchResults('automation interval', entries).map(entry => entry.title)).toEqual(['Auto-save']);
    });

    test('ranks exact and title-prefix matches ahead of detail matches', () => {
        const ranked = helpSearchResults('vim', [
            { title: 'Keyboard editing', detail: 'Vim behavior' },
            { title: 'Vim mode' },
            { title: 'Vim' },
        ]);
        expect(ranked.map(entry => entry.title)).toEqual(['Vim', 'Vim mode', 'Keyboard editing']);
    });

    test('returns no destinations for an empty query', () => {
        expect(helpSearchResults('   ', entries)).toEqual([]);
    });
});
