import {
    encodeMarkdownLinkTarget,
    markdownEditorNavigationAtPosition,
    markdownLinkDestinationAtPosition,
    markdownReferenceDefinition,
    markdownReferenceDefinitions,
    markdownReferenceLink,
    modifiedExternalBrowserURL,
    normalizeMarkdownReferenceLabel,
    planMarkdownLinkTargetReplacement,
    resolveMarkdownReferenceLink,
} from '../frontend/js/core/noteLinks.js';

describe('Markdown note-link target planning', () => {
    test('plans only Ctrl/Cmd-left-clicked HTTP links for the system browser', () => {
        expect(modifiedExternalBrowserURL('https://example.com/guide', {
            button: 0,
            ctrlKey: true,
        })).toBe('https://example.com/guide');
        expect(modifiedExternalBrowserURL('http://example.com', {
            button: 0,
            metaKey: true,
        })).toBe('http://example.com/');

        expect(modifiedExternalBrowserURL('notes/Guide.md', { button: 0, ctrlKey: true })).toBe('');
        expect(modifiedExternalBrowserURL('mailto:hello@example.com', { button: 0, ctrlKey: true })).toBe('');
        expect(modifiedExternalBrowserURL('https://example.com', { button: 0 })).toBe('');
        expect(modifiedExternalBrowserURL('https://example.com', { button: 1, ctrlKey: true })).toBe('');
        expect(modifiedExternalBrowserURL('https://example.com', {
            button: 0,
            ctrlKey: true,
            shiftKey: true,
        })).toBe('');
    });

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

    test('gives Markdown links precedence over hashtag-shaped fragment destinations', () => {
        const line = '[such](#as-this) and #todo';
        expect(markdownEditorNavigationAtPosition(line, line.indexOf('such') + 1)).toEqual({
            kind: 'link',
            label: 'such',
            target: '#as-this',
            destinationFrom: 7,
            destinationTo: 15,
        });
        expect(markdownEditorNavigationAtPosition(line, line.indexOf('#as-this') + 2)).toEqual({
            kind: 'link',
            label: 'such',
            target: '#as-this',
            destinationFrom: 7,
            destinationTo: 15,
        });
        expect(markdownEditorNavigationAtPosition(line, line.indexOf('#todo') + 2, {
            hashtagTarget: 'todo',
        })).toEqual({
            kind: 'hashtag',
            tag: 'todo',
        });
        expect(markdownEditorNavigationAtPosition(line, line.length)).toBeNull();
        expect(markdownEditorNavigationAtPosition(line, line.indexOf('#todo') + 2, {
            hashtagTarget: 'wip',
        })).toBeNull();
        expect(markdownEditorNavigationAtPosition('punctuation(#not-a-tag)', 14)).toBeNull();
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

    test('resolves full, collapsed, and shortcut reference links by normalized label', () => {
        expect(normalizeMarkdownReferenceLabel('  A   Link ')).toBe('a link');
        expect(markdownReferenceDefinition('[A Link]: notes/Target.md "Title"')).toEqual({
            label: 'A Link',
            target: 'notes/Target.md',
            key: 'a link',
        });
        expect(markdownReferenceLink('[Readable][A Link]')).toEqual({
            label: 'Readable',
            reference: 'A Link',
            key: 'a link',
        });
        expect(markdownReferenceLink('[A Link][]')).toEqual({
            label: 'A Link',
            reference: 'A Link',
            key: 'a link',
        });
        expect(resolveMarkdownReferenceLink('[a link]', new Map([['a link', 'notes/Target.md']]))).toEqual({
            label: 'a link',
            reference: 'a link',
            key: 'a link',
            target: 'notes/Target.md',
        });
        expect(markdownReferenceDefinitions([
            '---',
            '[metadata]: ignore.md',
            '---',
            '[A Link]: notes/Target.md',
            '[a link]: notes/Later.md',
            '```markdown',
            '[example]: ignore.md',
            '```',
        ].join('\n'))).toEqual(new Map([['a link', 'notes/Target.md']]));
    });

    test('leaves unresolved bracket prose and non-reference Markdown alone', () => {
        expect(resolveMarkdownReferenceLink('[a link]', new Map())).toBeNull();
        expect(markdownReferenceLink('[label](target.md)')).toBeNull();
        expect(markdownReferenceLink('[[Wiki target]]')).toBeNull();
        expect(markdownReferenceLink('[^footnote]')).toBeNull();
        expect(markdownReferenceLink('[ ]')).toBeNull();
    });
});
