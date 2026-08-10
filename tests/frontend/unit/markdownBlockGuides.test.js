import { EditorState } from '@codemirror/state';
import { markdownLanguage } from '@codemirror/lang-markdown';
import {
    leadingFrontmatterEnd,
    markdownBlockGuideKind,
} from '../../../frontend/js/core/markdownBlockGuideModel.js';
import { buildMarkdownBlockGuides } from '../../../frontend/js/markdownBlockGuides.js';

function guidePlan(source) {
    const state = EditorState.create({ doc: source, extensions: [markdownLanguage] });
    return { state, guides: buildMarkdownBlockGuides(state) };
}

describe('Markdown block guide model', () => {
    test('classifies the visible Markdown block vocabulary', () => {
        expect(markdownBlockGuideKind({ name: 'ATXHeading3' })).toBe('h3');
        expect(markdownBlockGuideKind({ name: 'Paragraph', source: 'plain prose' })).toBe('raw');
        expect(markdownBlockGuideKind({ name: 'Paragraph', source: '![alt](image.png)' })).toBe('image');
        expect(markdownBlockGuideKind({ name: 'BulletList', source: '- [ ] task' })).toBe('task');
        expect(markdownBlockGuideKind({ name: 'OrderedList', source: '1. item' })).toBe('list');
        expect(markdownBlockGuideKind({ name: 'Blockquote', source: '> [!note]\n> body' })).toBe('callout');
        expect(markdownBlockGuideKind({ name: 'FencedCode', info: 'mermaid' })).toBe('mermaid');
        expect(markdownBlockGuideKind({ name: 'FencedCode', info: 'vega-lite' })).toBe('chart');
        expect(markdownBlockGuideKind({ name: 'Table' })).toBe('table');
    });

    test('treats leading frontmatter as one raw block and finds its exact end', () => {
        const source = '---\ntitle: Guide\n---\n# Body';
        expect(leadingFrontmatterEnd(source)).toBe(source.indexOf('# Body'));
        const { guides } = guidePlan(source);
        expect(guides.map(guide => guide.label)).toEqual(['raw', 'h1']);
        expect(guides[0]).toMatchObject({ from: 0, to: source.indexOf('# Body') });
    });

    test('folds a heading through descendants but stops before its next peer or ancestor', () => {
        const source = '# Product\nintro\n## Goals\ngoal\n### Detail\ndetail\n## Release\nrelease\n# Archive\nold';
        const { state, guides } = guidePlan(source);
        const headings = guides.filter(guide => guide.level);
        expect(headings.map(guide => guide.label)).toEqual(['h1', 'h2', 'h3', 'h2', 'h1']);
        expect(state.sliceDoc(headings[0].foldFrom, headings[0].foldTo)).toContain('## Release');
        expect(state.sliceDoc(headings[0].foldFrom, headings[0].foldTo)).not.toContain('# Archive');
        expect(state.sliceDoc(headings[1].foldFrom, headings[1].foldTo)).toContain('### Detail');
        expect(state.sliceDoc(headings[1].foldFrom, headings[1].foldTo)).not.toContain('## Release');
    });
});
