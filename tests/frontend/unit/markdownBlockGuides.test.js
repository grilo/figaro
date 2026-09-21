import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { ensureSyntaxTree, foldEffect } from '@codemirror/language';
import { markdownLanguage } from '@codemirror/lang-markdown';
import {
    fencedCodeGuideLabel,
    leadingFrontmatterEnd,
    MARKDOWN_BLOCK_GUIDE_MAX_LABEL_LENGTH,
    markdownBlockGuideKind,
    markdownBlockGuideSpacerLength,
} from '../../../frontend/js/core/markdownBlockGuideModel.js';
import { markdownFoldAnchorPlan } from '../../../frontend/js/core/markdownFoldAnchorModel.js';
import {
    buildMarkdownBlockGuides,
    mapMarkdownBlockGuides,
    createMarkdownBlockGuidesExtension,
    buildTaskItemActionLines,
    markdownGuideForBlockWidget,
} from '../../../frontend/js/markdownBlockGuides.js';

function guidePlan(source) {
    const state = EditorState.create({ doc: source, extensions: [markdownLanguage] });
    return { state, guides: buildMarkdownBlockGuides(state) };
}

describe('Markdown block guide model', () => {
    test('scrolling and folding reuse document guides while edits invalidate their source ranges', () => {
        let { state, guides } = guidePlan('# Heading\nBody\n## Child\nText');
        const read = jest.spyOn(state.doc, 'toString');
        for (let i = 0; i < 30; i++) {
            state = state.update({ selection: { anchor: i % 10 } }).state;
            expect(buildMarkdownBlockGuides(state)).toBe(guides);
        }
        expect(read).not.toHaveBeenCalled();
        read.mockRestore();
        state = state.update({ changes: { from: 2, to: 9, insert: 'Changed' } }).state;
        expect(buildMarkdownBlockGuides(state)).not.toBe(guides);
        expect(buildMarkdownBlockGuides(state)[0].title).toBe('Changed');
        const sameDocument = state.doc;
        state = state.update({ effects: StateEffect.reconfigure.of([]) }).state;
        expect(state.doc).toBe(sameDocument);
        expect(buildMarkdownBlockGuides(state)).toEqual([]);
    });
    test('helper reservation covers actual document labels and image actions without a hypothetical longest fence', () => {
        expect(markdownBlockGuideSpacerLength([])).toBe(6);
        const { guides } = guidePlan('# Heading\n```mermaid\ngraph LR\n```');
        expect(markdownBlockGuideSpacerLength(guides)).toBe(7);
        expect(markdownBlockGuideSpacerLength([{ label: 'image', type: 'image' }], { showImageReset: true })).toBe(13);
        expect(markdownBlockGuideSpacerLength([{ label: 'abcdefghijklmnop', type: 'code' }])).toBe(16);
    });

    test('helper spacer keeps nested labels reserved through folding and updates after document edits', () => {
        const parent = document.body.appendChild(document.createElement('div'));
        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: '# Heading\n```mermaid\ngraph LR\n```',
                extensions: [markdownLanguage, createMarkdownBlockGuidesExtension()],
            }),
        });
        try {
            const spacer = () => parent.querySelector('.cm-markdownBlockGuideSpacer').textContent;
            expect(spacer()).toBe('x'.repeat(7));
            const heading = buildMarkdownBlockGuides(view.state)[0];
            view.dispatch({ effects: foldEffect.of({ from: heading.foldFrom, to: heading.foldTo }) });
            expect(spacer()).toBe('x'.repeat(7));
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '# Only heading' } });
            expect(spacer()).toBe('x'.repeat(6));
        } finally {
            view.destroy();
            parent.remove();
        }
    });

    test('helper layout reads the latest installed gutter after batched updates and cancels on removal', async () => {
        const parent = document.body.appendChild(document.createElement('div'));
        const extension = createMarkdownBlockGuidesExtension();
        const view = new EditorView({ parent, state: EditorState.create({
            doc: '# Heading', extensions: [markdownLanguage, extension],
        }) });
        const labels = [];
        view.dom.getBoundingClientRect = () => ({ left: 0, width: 1000 });
        const measure = jest.spyOn(view.contentDOM, 'getBoundingClientRect').mockImplementation(() => {
            labels.push(parent.querySelector('.cm-markdownBlockGuideSpacer')?.textContent);
            return { left: 0, width: 1000 };
        });
        try {
            // Mount and multiple updates in one task must measure only the
            // final DOM, never the previous spacer from inside plugin.update.
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '# Heading\n```mermaid\ngraph LR\n```' } });
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '# Heading\n```javascript\nlet a\n```' } });
            expect(labels).toEqual([]);
            await new Promise(queueMicrotask);
            expect(labels).toEqual(['x'.repeat(10)]);
            labels.length = 0;
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '# Heading' } });
            await new Promise(queueMicrotask);
            expect(labels).toEqual(['x'.repeat(6)]);
            labels.length = 0;
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '# Changed' } });
            view.dispatch({ effects: StateEffect.reconfigure.of([markdownLanguage]) });
            await new Promise(queueMicrotask);
            expect(labels).toEqual([]);
            expect(view.dom.style.getPropertyValue('--editor-block-before-rail-width')).toBe('');
        } finally {
            measure.mockRestore();
            view.destroy();
            parent.remove();
        }
    });

    test('classifies headings, fenced code, tables, and standalone images', () => {
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
            source: '![Portrait|190x121](portrait.png)',
        })).toBe('image');
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

    test('finds unfinished task actions without matching checked tasks or fenced examples', () => {
        const source = [
            '---',
            'example: - [ ] not a task',
            '---',
            '- [ ] Ship release',
            '- [x] Already shipped',
            '```md',
            '- [ ] fenced example',
            '```',
            '- [ ] Dated [due 2026-09-14](2026-09-14.md)',
        ].join('\n');
        const state = EditorState.create({ doc: source, extensions: [markdownLanguage] });
        expect(buildTaskItemActionLines(state)).toEqual([
            expect.objectContaining({
                lineFrom: source.indexOf('- [ ] Ship release'),

            }),
            expect.objectContaining({
                lineFrom: source.lastIndexOf('- [ ] Dated'),

            }),
        ]);
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

    test('gives an ordinary standalone image a sized image guide', () => {
        const source = 'Before\n![Portrait|190x121](portrait.png)\nAfter';
        const { guides } = guidePlan(source);
        expect(guides.find(candidate => candidate.type === 'image')).toMatchObject({
            label: 'image',
            type: 'image',
            imageSized: true,
            foldFrom: source.indexOf('![Portrait]'.slice(0, 10)),
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

test('a prose edit maps complete guides without reading the note, while structural edits still rebuild', () => {
    const { ensureSyntaxTree } = require('@codemirror/language');
    const { mapMarkdownBlockGuides } = require('../../../frontend/js/markdownBlockGuides.js');
    for (const count of [10, 1000]) {
        const source = 'Ordinary prose here.\n\n' + Array(count).fill('## Heading\n\nBody text.\n\n').join('');
        let state = EditorState.create({ doc: source, extensions: [markdownLanguage] });
        ensureSyntaxTree(state, state.doc.length, 10000); state = state.update({}).state;
        const initial = buildMarkdownBlockGuides(state);
        for (let index = 0; index < 20; index++) {
            const transaction = state.update({ changes: index % 2 ? { from: 2, to: 3 } : { from: 2, insert: 'x' } });
            const full = jest.spyOn(transaction.state.doc, 'toString');
            expect(mapMarkdownBlockGuides(transaction)).toBe(true);
            const current = buildMarkdownBlockGuides(transaction.state);
            expect(full).not.toHaveBeenCalled(); full.mockRestore();
            expect(current[0].from).toBe(initial[0].from + (index % 2 ? 0 : 1));
            expect(current.at(-1).foldTo).toBe(transaction.state.doc.length);
            state = transaction.state;
        }
        const structural = state.update({ changes: { from: 0, insert: '# ' } });
        expect(mapMarkdownBlockGuides(structural)).toBe(false);
        expect(buildMarkdownBlockGuides(structural.state)[0].title).toBe('Ordinary prose here.');
    }
});

test('guide construction never copies the remaining block list for each heading', () => {
    const { ensureSyntaxTree } = require('@codemirror/language');
    const source = Array(1000).fill('## Heading\n\nParagraph.\n\n').join('');
    let state = EditorState.create({ doc: source, extensions: [markdownLanguage] });
    ensureSyntaxTree(state, state.doc.length, 10000); state = state.update({}).state;
    const slice = Array.prototype.slice;
    let copiedEntries = 0;
    const spy = jest.spyOn(Array.prototype, 'slice').mockImplementation(function (...args) {
        const result = slice.apply(this, args);
        if (this[0] && Object.hasOwn(this[0], 'info') && Object.hasOwn(this[0], 'name')) copiedEntries += result.length;
        return result;
    });
    try {
        expect(buildMarkdownBlockGuides(state)).toHaveLength(1000);
        expect(copiedEntries).toBe(0);
    } finally { spy.mockRestore(); }
});


test('helper rail caches spacer labels across 20 cursor moves in a thousand-heading note', () => {
    const source = 'Ordinary prose.\n\n' + Array(1000).fill('## Heading\n\nProse.\n\n').join('');
    let state = EditorState.create({ doc: source, extensions: [markdownLanguage,
        createMarkdownBlockGuidesExtension()] });
    ensureSyntaxTree(state, source.length, 10000); state = state.update({}).state;
    const view = new EditorView({ state, parent: document.body });
    try {
        const guides = buildMarkdownBlockGuides(view.state);
        let reads = 0;
        for (const guide of guides) {
            const label = guide.label;
            Object.defineProperty(guide, 'label', { configurable: true, get() { reads++; return label; } });
        }
        for (let index = 0; index < 20; index++) view.dispatch({ selection: { anchor: 2 + index % 5 } });
        expect(reads).toBe(0);
        view.dispatch({ changes: { from: 2, insert: 'extra ' } });
        expect(buildMarkdownBlockGuides(view.state).at(-1).from).toBe(guides.at(-1).from + 6);
    } finally { view.destroy(); }
});

test('widget guide lookup tests only overlapping candidates near the end of a large note', () => {
    let reads = 0;
    const guides = Array.from({ length: 1000 }, (_, index) => ({
        from: index * 10, to: index * 10 + 8,
        get type() { reads++; return 'code'; },
    }));
    for (let index = 0; index < 20; index++) expect(markdownGuideForBlockWidget(guides, { from: 9990, to: 9998 })).toBe(guides[999]);
    expect(reads).toBe(20);
});


test('local heading, code-language and soft line edits preserve guide boundaries without whole-document reads', () => {
    const source = '# Heading title\n\nOrdinary paragraph.\n\n```javascript\nlet value = 1;\n```\n\n## Child heading\n\nMore text.\n\n# Next heading';
    let { state } = guidePlan(source);
    for (const [target, insert, remove] of [['title', 'useful ', 0], ['paragraph', '\n', 0], ['javascript', 'python', 10], ['value', 'other', 5]]) {
        buildMarkdownBlockGuides(state);
        const from = state.doc.toString().indexOf(target), transaction = state.update({ changes: { from, to: from + remove, insert } });
        const read = jest.spyOn(transaction.newDoc, 'toString');
        expect(mapMarkdownBlockGuides(transaction)).toBe(true);
        const guides = buildMarkdownBlockGuides(transaction.state);
        expect(read).not.toHaveBeenCalled();
        read.mockRestore();
        state = transaction.state;
        const fresh = guidePlan(state.doc.toString()).guides;
        expect(guides.map(({ sourceIdentity, ...guide }) => guide)).toEqual(fresh);
    }
});

test('a newly standalone image invalidates line-sensitive guides even when its paragraph survives', () => {
    let { state } = guidePlan('Words ![Alt](image.png)\nContinued text.');
    const transaction = state.update({ changes: { from: 0, to: 6 } });
    expect(mapMarkdownBlockGuides(transaction)).toBe(false);
    expect(buildMarkdownBlockGuides(transaction.state).map(guide => guide.type)).toEqual(['image']);
});
