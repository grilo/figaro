import { EditorState } from '@codemirror/state';
import { foldable } from '@codemirror/language';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { markdownHeadingFoldingExtension } from '../../../frontend/js/markdownHeadingFolding.js';

function markdownState(source) {
    return EditorState.create({
        doc: source,
        extensions: [markdownLanguage, markdownHeadingFoldingExtension],
    });
}

function foldRangeAtLine(state, lineNumber) {
    const line = state.doc.line(lineNumber);
    return foldable(state, line.from, line.to);
}

describe('Markdown heading folding', () => {
    test('ends each nested ATX heading section at the next peer or ancestor heading', () => {
        const state = markdownState([
            '# Product roadmap',
            'Overview',
            '## Goals',
            'Goal body',
            '### Editor details',
            'Nested body',
            '## Release scope',
            'Scope body',
            '# Archive',
            'Archived body',
        ].join('\n'));

        expect(foldRangeAtLine(state, 1)).toEqual({
            from: state.doc.line(1).to,
            to: state.doc.line(8).to,
        });
        expect(foldRangeAtLine(state, 3)).toEqual({
            from: state.doc.line(3).to,
            to: state.doc.line(6).to,
        });
        expect(foldRangeAtLine(state, 5)).toEqual({
            from: state.doc.line(5).to,
            to: state.doc.line(6).to,
        });
        expect(foldRangeAtLine(state, 7)).toEqual({
            from: state.doc.line(7).to,
            to: state.doc.line(8).to,
        });
        expect(foldRangeAtLine(state, 9)).toEqual({
            from: state.doc.line(9).to,
            to: state.doc.length,
        });
    });

    test('does not offer an empty section or a hash line inside fenced code', () => {
        const state = markdownState([
            '# Empty',
            '# Real section',
            'Before',
            '```md',
            '# Not a heading',
            '```',
            'After',
            '# Next',
            'Body',
        ].join('\n'));

        expect(foldRangeAtLine(state, 1)).toBeNull();
        expect(foldRangeAtLine(state, 5)).toBeNull();
        expect(foldRangeAtLine(state, 2)).toEqual({
            from: state.doc.line(2).to,
            to: state.doc.line(7).to,
        });
    });

    test('ignores heading-shaped frontmatter comments and Setext headings', () => {
        const state = markdownState([
            '---',
            '# YAML comment',
            'title: Roadmap',
            '---',
            'Underlined heading',
            '------------------',
            'Setext body',
            '# Body heading',
            'Body text',
        ].join('\n'));

        expect(foldRangeAtLine(state, 2)).toBeNull();
        expect(foldRangeAtLine(state, 5)).toBeNull();
        expect(foldRangeAtLine(state, 8)).toEqual({
            from: state.doc.line(8).to,
            to: state.doc.length,
        });
    });
});
