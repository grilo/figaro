import { EditorState } from '@codemirror/state';
import { createFrontmatterCompletionSource } from '../frontend/js/frontmatterCompletions.js';

function completionContext(source, pos = source.length, explicit = true) {
    return { state: EditorState.create({ doc: source }), pos, explicit };
}

describe('frontmatter completions', () => {
    test('suggests metadata keys only inside leading YAML frontmatter', () => {
        const completions = createFrontmatterCompletionSource();
        const source = '---\npri\n---\n# Body';
        const result = completions(completionContext(source, source.indexOf('\n---', 4)));

        expect(result).not.toBeNull();
        expect(result.from).toBe(4);
        expect(result.options.map(option => option.label)).toEqual(expect.arrayContaining([
            'title', 'aliases', 'tags', 'status', 'cover-page', 'toc-depth', 'page-numbers', 'print-stylesheet',
        ]));
        expect(result.options.find(option => option.label === 'print-stylesheet')).toMatchObject({
            apply: 'print-stylesheet: ',
            detail: 'Figaro PDF stylesheet',
        });

        expect(completions(completionContext('---\ntitle: Test\n---\npri'))).toBeNull();
    });

    test('answers body completions without materializing the note', () => {
        const completions = createFrontmatterCompletionSource();
        const body = 'A paragraph of prose.\n'.repeat(2000);
        for (const source of [`# Title\n${body}`, `---\ntitle: Test\n---\n${body}`, `\uFEFF---\ntitle: Test\n...\n${body}`]) {
            const context = completionContext(source);
            const materialize = jest.spyOn(context.state.doc, 'toString');

            expect(completions(context)).toBeNull();
            expect(materialize).not.toHaveBeenCalled();
        }

        // Inside the block only the frontmatter itself is read.
        const source = `---\npri\n---\n${body}`;
        const context = completionContext(source, source.indexOf('\n---', 4));
        const materialize = jest.spyOn(context.state.doc, 'toString');
        expect(completions(context).options.some(option => option.label === 'title')).toBe(true);
        expect(materialize).not.toHaveBeenCalled();
    });

    test('also assists while the user is still creating an unclosed frontmatter block', () => {
        const completions = createFrontmatterCompletionSource();
        const source = '---\nsta';
        const result = completions(completionContext(source));

        expect(result).not.toBeNull();
        expect(result.from).toBe(4);
        expect(result.options.some(option => option.label === 'status')).toBe(true);
    });

    test('suggests controlled status values plus vault-relative print stylesheets', () => {
        const completions = createFrontmatterCompletionSource({
            getActiveFilePath: () => 'notes/daily/report.md',
            getFileTree: () => [{
                type: 'directory', name: 'notes', path: 'notes', children: [{
                    type: 'directory', name: 'styles', path: 'notes/styles', children: [
                        { type: 'file', name: 'print.css', path: 'notes/styles/print.css' },
                        { type: 'file', name: 'Print CSS.css', path: 'notes/styles/Print CSS.css' },
                    ],
                }],
            }],
        });

        const statusSource = '---\nstatus: a\n---';
        const status = completions(completionContext(statusSource, statusSource.indexOf('\n---')));
        expect(status.options.map(option => option.label)).toEqual(['draft', 'active', 'archived']);

        const spellcheckSource = '---\nspellcheck: \n---';
        const spellcheck = completions(completionContext(spellcheckSource, spellcheckSource.indexOf('\n---')));
        expect(spellcheck).toBeNull();

        const stylesheetSource = '---\nprint-stylesheet: \n---';
        const stylesheet = completions(completionContext(stylesheetSource, stylesheetSource.indexOf('\n---')));
        expect(stylesheet.options).toEqual(expect.arrayContaining([
            expect.objectContaining({ label: '../styles/print.css', apply: '../styles/print.css' }),
            expect.objectContaining({ label: '../styles/Print CSS.css', apply: '"../styles/Print CSS.css"' }),
        ]));
    });

});
