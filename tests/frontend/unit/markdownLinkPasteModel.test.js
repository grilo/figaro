import { markdownLinkPastePlan } from '../frontend/js/core/markdownLinkPasteModel.js';

describe('Markdown URL-over-selection paste policy', () => {
    test('wraps selected prose for every URL form supported by the Markdown editor', () => {
        expect(markdownLinkPastePlan({
            clipboardText: 'https://example.com/reference',
            selectedText: 'Selected words',
            markdownActive: true,
            plainSelection: true,
        })).toEqual({
            target: 'https://example.com/reference',
            insertion: '[Selected words](https://example.com/reference)',
        });
        expect(markdownLinkPastePlan({
            clipboardText: 'www.example.com',
            selectedText: 'Website',
            markdownActive: true,
            plainSelection: true,
        })).toEqual({
            target: 'https://www.example.com',
            insertion: '[Website](https://www.example.com)',
        });
    });

    test('leaves non-URL, empty, non-Markdown, and protected selections to their normal paste paths', () => {
        const base = {
            clipboardText: 'https://example.com',
            selectedText: 'Selected words',
            markdownActive: true,
            plainSelection: true,
        };
        expect(markdownLinkPastePlan({ ...base, clipboardText: 'ordinary text' })).toBeNull();
        expect(markdownLinkPastePlan({ ...base, selectedText: '' })).toBeNull();
        expect(markdownLinkPastePlan({ ...base, markdownActive: false })).toBeNull();
        expect(markdownLinkPastePlan({ ...base, plainSelection: false })).toBeNull();
    });
});
