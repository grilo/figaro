import {
    encodeMarkdownLinkTarget,
    markdownLinkDestinationAtPosition,
    planMarkdownLinkTargetReplacement,
} from '../frontend/js/core/noteLinks.js';

describe('Markdown note-link target planning', () => {
    test('locates only the destination of the conventional link under the pointer', () => {
        const line = 'Before [Inner Source](notes/Inner%20Source.md) after';
        expect(markdownLinkDestinationAtPosition(line, 12)).toEqual({
            label: 'Inner Source',
            target: 'notes/Inner%20Source.md',
            destinationFrom: 22,
            destinationTo: 45,
        });
        expect(markdownLinkDestinationAtPosition(line, 2)).toBeNull();
        expect(markdownLinkDestinationAtPosition('![Inner Source](image.png)', 4)).toBeNull();
    });

    test('rewrites only a still-current destination and URL-encodes spaces', () => {
        const document = 'See [Inner Source](notes/Inner%20Source.md) today.';
        const edit = { from: 19, to: 42, target: 'notes/Inner%20Source.md' };
        const change = planMarkdownLinkTargetReplacement(document, edit, 'notes/Inner Source!.md');
        expect(change).toEqual({ from: 19, to: 42, insert: 'notes/Inner%20Source!.md' });
        expect(document.slice(0, change.from) + change.insert + document.slice(change.to))
            .toBe('See [Inner Source](notes/Inner%20Source!.md) today.');
        expect(encodeMarkdownLinkTarget('notes/Inner Source.md')).toBe('notes/Inner%20Source.md');
    });

    test('refuses a stale or invalid source range', () => {
        expect(planMarkdownLinkTargetReplacement(
            '[Inner Source](changed.md)',
            { from: 15, to: 23, target: 'old.md' },
            'InnerSource.md'
        )).toBeNull();
        expect(planMarkdownLinkTargetReplacement('text', { from: -1, to: 2, target: 'te' }, 'note.md')).toBeNull();
    });
});
