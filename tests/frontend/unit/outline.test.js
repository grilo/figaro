import { activeOutlineHeadingIndex, extractOutlineHeadings } from '../frontend/js/outline.js';

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
});
