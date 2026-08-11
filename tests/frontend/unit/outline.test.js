import {
    activeOutlineHeadingHierarchy,
    activeOutlineHeadingIndex,
    extractOutlineHeadings,
    stickyHeadingBoundaryPosition,
} from '../frontend/js/core/outlineModel.js';

describe('Markdown document outline', () => {
    test('extracts nested ATX headings with exact source positions', () => {
        const source = '# Start\nBody\n## Decision ##\nMore\n#### Detail';

        expect(extractOutlineHeadings(source)).toEqual([
            { level: 1, text: 'Start', from: 0 },
            { level: 2, text: 'Decision', from: 13 },
            { level: 4, text: 'Detail', from: 33 },
        ]);
    });

    test('ignores heading-shaped text in fenced code while preserving real headings after it', () => {
        const source = [
            '# Real heading',
            '```markdown',
            '## Example heading',
            '```',
            '### After code',
            '    # Indented source',
        ].join('\n');

        expect(extractOutlineHeadings(source)).toEqual([
            { level: 1, text: 'Real heading', from: 0 },
            { level: 3, text: 'After code', from: 50 },
        ]);
    });

    test('recognizes Setext headings but excludes leading YAML frontmatter', () => {
        const source = [
            '---',
            'title: Not a heading',
            '---',
            'A real title',
            '===========',
            'A smaller heading',
            '-----------------',
        ].join('\n');

        expect(extractOutlineHeadings(source)).toEqual([
            { level: 1, text: 'A real title', from: 29 },
            { level: 2, text: 'A smaller heading', from: 54 },
        ]);
    });

    test('keeps the current section on the nearest preceding heading', () => {
        const headings = [
            { level: 1, text: 'Start', from: 0 },
            { level: 2, text: 'Decision', from: 20 },
            { level: 3, text: 'Detail', from: 55 },
        ];

        expect(activeOutlineHeadingIndex(headings, 0)).toBe(0);
        expect(activeOutlineHeadingIndex(headings, 44)).toBe(1);
        expect(activeOutlineHeadingIndex(headings, 55)).toBe(2);
        expect(activeOutlineHeadingIndex([], 12)).toBe(-1);
    });

    test('keeps every active ancestor in the sticky hierarchy', () => {
        const headings = [
            { level: 1, text: 'Product', from: 0 },
            { level: 2, text: 'Goals', from: 20 },
            { level: 3, text: 'Editor', from: 40 },
            { level: 2, text: 'Release', from: 70 },
        ];

        expect(activeOutlineHeadingHierarchy(headings, 55).map(heading => heading.text))
            .toEqual(['Product', 'Goals', 'Editor']);
        expect(activeOutlineHeadingHierarchy(headings, 75).map(heading => heading.text))
            .toEqual(['Product', 'Release']);
        expect(activeOutlineHeadingHierarchy(headings, -1)).toEqual([]);
    });

    test('activates a sticky section only when its source line crosses the covered boundary', () => {
        expect(stickyHeadingBoundaryPosition(-12, { from: 0, top: 0 })).toBe(-1);
        expect(stickyHeadingBoundaryPosition(0, { from: 0, top: 0 })).toBe(0);
        expect(stickyHeadingBoundaryPosition(199, { from: 20, top: 200 })).toBe(19);
        expect(stickyHeadingBoundaryPosition(200, { from: 20, top: 200 })).toBe(20);
        expect(stickyHeadingBoundaryPosition(Number.NaN, { from: 20, top: 200 })).toBe(-1);
    });
});
