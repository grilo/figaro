import {
    drawioImageCreationTarget,
    drawioImageStateForRead,
    drawioImageVaultURL,
    isLocalDrawioMarkdownImage,
    parseMarkdownImageSyntax,
} from '../frontend/js/core/drawioImageCreationModel.js';

describe('missing Draw.io image target resolution', () => {
    test('resolves same-folder, parent-folder, root, and encoded destinations', () => {
        expect(drawioImageCreationTarget({
            imageSource: 'flow.drawio.svg',
            notePath: 'Projects/plan.md',
        })).toEqual({ path: 'Projects/flow.drawio.svg', title: 'flow.drawio.svg' });
        expect(drawioImageCreationTarget({
            imageSource: '../Diagrams/system.drawio.svg',
            notePath: 'Projects/Notes/plan.md',
        })).toEqual({ path: 'Projects/Diagrams/system.drawio.svg', title: 'system.drawio.svg' });
        expect(drawioImageCreationTarget({
            imageSource: '/Diagrams/system%20map.drawio.svg',
            notePath: 'Projects/plan.md',
        })).toEqual({ path: 'Diagrams/system map.drawio.svg', title: 'system map.drawio.svg' });
        expect(drawioImageCreationTarget({
            imageSource: '<flow%20chart.drawio.svg>',
            notePath: 'plan.md',
        })).toEqual({ path: 'flow chart.drawio.svg', title: 'flow chart.drawio.svg' });
    });

    test('rejects non-diagrams, remote URLs, fragments, malformed encoding, and vault escapes', () => {
        for (const imageSource of [
            'picture.svg',
            'https://example.test/flow.drawio.svg',
            '<https://example.test/flow.drawio.svg>',
            'https%3A%2F%2Fexample.test%2Fflow.drawio.svg',
            '//example.test/flow.drawio.svg',
            'flow.drawio.svg#page-1',
            'flow%ZZ.drawio.svg',
            '../../flow.drawio.svg',
            '%2e%2e/%2e%2e/flow.drawio.svg',
        ]) {
            expect(drawioImageCreationTarget({ imageSource, notePath: 'Notes/plan.md' })).toBeNull();
        }
    });

    test('encodes a validated target as the matching vault image route', () => {
        expect(drawioImageVaultURL({ path: 'Diagrams/system map.drawio.svg' }))
            .toBe('/vault/Diagrams/system%20map.drawio.svg');
        expect(drawioImageVaultURL({ path: 'Diagrams/system map.drawio.svg' }, 7))
            .toBe('/vault/Diagrams/system%20map.drawio.svg?figaro-preview=7');
        expect(drawioImageVaultURL(null)).toBeNull();
    });

    test('recognizes only complete local Draw.io Markdown images', () => {
        expect(parseMarkdownImageSyntax('![Flow](flow.drawio.svg "System")')).toEqual({
            alt: 'Flow',
            src: 'flow.drawio.svg',
            title: 'System',
        });
        expect(isLocalDrawioMarkdownImage('![Flow](flow.drawio.svg)')).toBe(true);
        expect(isLocalDrawioMarkdownImage('![Flow](<Diagrams/flow.drawio.svg>)')).toBe(true);
        expect(isLocalDrawioMarkdownImage('![Flow](https://example.test/flow.drawio.svg)')).toBe(false);
        expect(isLocalDrawioMarkdownImage('prefix ![Flow](flow.drawio.svg)')).toBe(false);
        expect(isLocalDrawioMarkdownImage('![Flow](flow.svg)')).toBe(false);
    });

    test('distinguishes previewable, empty, missing, and unreadable diagrams', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
        expect(drawioImageStateForRead(null)).toEqual({ kind: 'create' });
        expect(drawioImageStateForRead({ path: 'flow.drawio.svg', content: '' }))
            .toEqual({ kind: 'open' });
        expect(drawioImageStateForRead({ path: 'flow.drawio.svg', content: svg }))
            .toEqual({
                kind: 'preview',
                source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
            });
        expect(drawioImageStateForRead(null, new Error('unreadable')))
            .toEqual({ kind: 'error' });
    });
});
