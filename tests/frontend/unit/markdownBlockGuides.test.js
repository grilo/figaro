import { EditorState } from '@codemirror/state';
import { markdownLanguage } from '@codemirror/lang-markdown';
import {
    fencedCodeGuideLabel,
    leadingFrontmatterEnd,
    MARKDOWN_BLOCK_GUIDE_MAX_LABEL_LENGTH,
    markdownBlockGuideKind,
} from '../../../frontend/js/core/markdownBlockGuideModel.js';
import { markdownFoldAnchorPlan } from '../../../frontend/js/core/markdownFoldAnchorModel.js';
import {
    buildMarkdownBlockGuides,
    markdownGuideForBlockWidget,
} from '../../../frontend/js/markdownBlockGuides.js';

function guidePlan(source) {
    const state = EditorState.create({ doc: source, extensions: [markdownLanguage] });
    return { state, guides: buildMarkdownBlockGuides(state) };
}

describe('Markdown block guide model', () => {
    test('classifies headings, fenced code, tables, and standalone local Draw.io images', () => {
        expect(markdownBlockGuideKind({ name: 'ATXHeading3' })).toBe('h3');
        expect(markdownBlockGuideKind({ name: 'Paragraph', source: 'plain prose' })).toBeNull();
        expect(markdownBlockGuideKind({ name: 'BulletList', source: '- [ ] task' })).toBeNull();
        expect(markdownBlockGuideKind({ name: 'Blockquote', source: '> quote' })).toBeNull();
        expect(markdownBlockGuideKind({ name: 'CodeBlock', source: '    indented' })).toBeNull();
        expect(markdownBlockGuideKind({ name: 'FencedCode' })).toBe('code');
        expect(markdownBlockGuideKind({ name: 'FencedCode', info: 'yaml' })).toBe('yaml');
        expect(markdownBlockGuideKind({ name: 'FencedCode', info: 'mermaid' })).toBe('mermaid');
        expect(markdownBlockGuideKind({ name: 'FencedCode', info: 'vega-lite options' })).toBe('vega-lite');
        expect(markdownBlockGuideKind({ name: 'Table' })).toBe('table');
        expect(markdownBlockGuideKind({
            name: 'Paragraph',
            source: '![Flow](Diagrams/flow.drawio.svg)',
        })).toBe('drawio');
        expect(markdownBlockGuideKind({
            name: 'Paragraph',
            source: 'Text ![Flow](Diagrams/flow.drawio.svg)',
        })).toBeNull();
    });

    test('normalizes a concise first code-fence language token', () => {
        expect(fencedCodeGuideLabel('YAML title="Config"')).toBe('yaml');
        expect(fencedCodeGuideLabel('{.typescript linenos}')).toBe('typescript');
        expect(fencedCodeGuideLabel('language-name-that-is-too-long')).toBe('code');
        expect(fencedCodeGuideLabel('x'.repeat(MARKDOWN_BLOCK_GUIDE_MAX_LABEL_LENGTH)))
            .toBe('x'.repeat(MARKDOWN_BLOCK_GUIDE_MAX_LABEL_LENGTH));
        expect(fencedCodeGuideLabel('x'.repeat(MARKDOWN_BLOCK_GUIDE_MAX_LABEL_LENGTH + 1))).toBe('code');
        expect(fencedCodeGuideLabel('')).toBe('code');
    });

    test('skips leading frontmatter and every non-guide block', () => {
        const source = '---\ntitle: Guide\n---\n# Body';
        expect(leadingFrontmatterEnd(source)).toBe(source.indexOf('# Body'));
        const { guides } = guidePlan(source);
        expect(guides.map(guide => guide.label)).toEqual(['h1']);
        expect(guides[0]).toMatchObject({ from: source.indexOf('# Body') });
    });

    test('labels typed and untyped fences and exposes a table without prose or list guides', () => {
        const source = [
            '# Body',
            'ordinary prose',
            '- list item',
            '```yaml',
            'enabled: true',
            '```',
            '```',
            'untyped',
            '```',
            '| Key | Value |',
            '| --- | --- |',
            '| mode | test |',
        ].join('\n');
        const { state, guides } = guidePlan(source);
        expect(guides.map(guide => guide.label)).toEqual(['h1', 'yaml', 'code', 'table']);
        expect(guides.slice(1).map(guide => guide.type)).toEqual(['code', 'code', 'table']);
        expect(guides.slice(1).map(guide => guide.foldFrom)).toEqual(
            guides.slice(1).map(guide => state.doc.lineAt(guide.from).to),
        );
        expect(state.sliceDoc(guides[1].foldFrom, guides[1].foldTo)).toContain('enabled: true');
        expect(state.sliceDoc(guides[3].foldFrom, guides[3].foldTo)).toContain('| mode | test |');
    });

    test('gives a standalone Draw.io image a whole-source fold range', () => {
        const source = 'Before\n![Flow](Diagrams/flow.drawio.svg)\nAfter';
        const { guides } = guidePlan(source);
        const guide = guides.find(candidate => candidate.type === 'drawio');
        const from = source.indexOf('![Flow]');
        expect(guide).toMatchObject({
            label: 'drawio',
            type: 'drawio',
            from,
            to: from + '![Flow](Diagrams/flow.drawio.svg)'.length,
            foldFrom: from,
            foldTo: from + '![Flow](Diagrams/flow.drawio.svg)'.length,
            foldable: true,
        });
    });

    test('matches rendered block ranges without attaching guides to adjacent point widgets', () => {
        const guides = [
            { type: 'heading', from: 0, to: 8 },
            { type: 'code', label: 'mermaid', from: 10, to: 42 },
        ];
        expect(markdownGuideForBlockWidget(guides, { from: 10, to: 42 })).toBe(guides[1]);
        expect(markdownGuideForBlockWidget(guides, { from: 12, to: 40 })).toBe(guides[1]);
        expect(markdownGuideForBlockWidget(guides, { from: 10, to: 10 })).toBeNull();
        expect(markdownGuideForBlockWidget(guides, { from: 42, to: 50 })).toBeNull();
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

    test('keeps a clicked guide fixed and adds only the bottom reserve required by scroll clamping', () => {
        expect(markdownFoldAnchorPlan({
            currentGuideTop: 420,
            targetGuideTop: 400,
            scrollTop: 300,
            scrollHeight: 1200,
            clientHeight: 600,
        })).toEqual({ scrollTop: 320, reserve: 0 });

        expect(markdownFoldAnchorPlan({
            currentGuideTop: 460,
            targetGuideTop: 400,
            scrollTop: 300,
            scrollHeight: 850,
            clientHeight: 600,
        })).toEqual({ scrollTop: 360, reserve: 110 });

        expect(markdownFoldAnchorPlan({
            currentGuideTop: 400,
            targetGuideTop: 400,
            scrollTop: 360,
            scrollHeight: 1070,
            clientHeight: 600,
            currentReserve: 110,
        })).toEqual({ scrollTop: 360, reserve: 0 });
    });
});
