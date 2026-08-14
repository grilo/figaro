import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, indentMore, undo } from '@codemirror/commands';
import { getIndentUnit, indentUnit } from '@codemirror/language';

import { openMermaidEditor } from '../../../frontend/js/mermaidEditor.js';
import { scanDiagramFences } from '../../../frontend/js/liveDiagramPlugin.js';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

describe('Mermaid Editor dialog', () => {
    let mainView;

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '<main id="app"><div id="editor"></div></main>';
    });

    afterEach(() => {
        document.querySelector('.custom-modal-overlay')?.remove();
        mainView?.destroy();
        mainView = null;
        jest.useRealTimers();
    });

    function open(source = 'flowchart TD\n  A --> B', tabSize = 4) {
        const markdown = `Before\n\`\`\`mermaid\n${source}\n\`\`\`\nAfter`;
        mainView = new EditorView({
            parent: document.getElementById('editor'),
            state: EditorState.create({
                doc: markdown,
                extensions: [
                    history(),
                    EditorState.tabSize.of(tabSize),
                    indentUnit.of(' '.repeat(tabSize)),
                ],
            }),
        });
        const block = scanDiagramFences(mainView.state.doc)[0];
        const parse = jest.fn().mockResolvedValue({ diagramType: 'flowchart-v2' });
        const render = jest.fn(value => Promise.resolve(`<svg><text>${value}</text></svg>`));
        const catalog = [
            {
                id: 'flowchart-v2',
                name: 'Flowchart',
                description: 'Flows',
                examples: [{ id: 'flow-0', title: 'Basic', code: 'flowchart LR\n  Start --> End' }],
            },
            {
                id: 'sequence',
                name: 'Sequence',
                description: 'Messages',
                examples: [{ id: 'sequence-0', title: 'Basic', code: 'sequenceDiagram\n  A->>B: Hello' }],
            },
        ];
        return {
            markdown,
            dialog: openMermaidEditor(mainView, block, {
                parse,
                render,
                catalog,
                session: { validationDelay: 400 },
            }),
            parse,
            render,
        };
    }

    test('protects existing source until explicit replacement, then enters live template browsing', () => {
        const { dialog } = open();
        const diagramSelect = dialog.overlay.querySelector('.mermaid-editor-diagram-select');
        const templateButton = dialog.overlay.querySelector('.mermaid-editor-load-template');
        expect(templateButton.disabled).toBe(false);

        diagramSelect.value = 'sequence';
        diagramSelect.dispatchEvent(new Event('change', { bubbles: true }));
        expect(dialog.editorView.state.doc.toString()).toBe('flowchart TD\n  A --> B');
        expect(dialog.overlay.querySelector('.mermaid-editor-template-select').value).toBe('sequence-0');

        templateButton.click();
        expect(dialog.editorView.state.doc.toString()).toBe('sequenceDiagram\n  A->>B: Hello');
        expect(document.activeElement).toBe(dialog.editorView.contentDOM);
        expect(templateButton.disabled).toBe(true);

        diagramSelect.value = 'flowchart-v2';
        diagramSelect.dispatchEvent(new Event('change', { bubbles: true }));
        expect(dialog.editorView.state.doc.toString()).toBe('flowchart LR\n  Start --> End');
        expect(templateButton.disabled).toBe(true);
    });

    test('starts a whitespace-only block from the first template and protects it after a manual edit', () => {
        const { dialog } = open('  \n\t');
        const diagramSelect = dialog.overlay.querySelector('.mermaid-editor-diagram-select');
        const templateButton = dialog.overlay.querySelector('.mermaid-editor-load-template');
        expect(dialog.editorView.state.doc.toString()).toBe('flowchart LR\n  Start --> End');
        expect(templateButton.disabled).toBe(true);

        diagramSelect.value = 'sequence';
        diagramSelect.dispatchEvent(new Event('change', { bubbles: true }));
        expect(dialog.editorView.state.doc.toString()).toBe('sequenceDiagram\n  A->>B: Hello');
        expect(templateButton.disabled).toBe(true);

        dialog.editorView.dispatch({
            changes: { from: dialog.editorView.state.doc.length, insert: ' ' },
            userEvent: 'input.type',
        });
        expect(templateButton.disabled).toBe(false);
    });

    test('inherits the global tab size for normal Mermaid source indentation', () => {
        const { dialog } = open('flowchart TD\nA --> B', 7);
        const line = dialog.editorView.state.doc.line(2);
        dialog.editorView.dispatch({ selection: { anchor: line.from } });

        expect(dialog.editorView.state.tabSize).toBe(7);
        expect(getIndentUnit(dialog.editorView.state)).toBe(7);
        expect(indentMore(dialog.editorView)).toBe(true);
        expect(dialog.editorView.state.doc.line(2).text).toBe('       A --> B');
    });

    test('Cancel is non-destructive, while Apply is one undoable fence-body change', () => {
        const { markdown, dialog } = open();
        dialog.editorView.dispatch({
            changes: { from: 0, to: dialog.editorView.state.doc.length, insert: 'flowchart LR\n  X --> Y' },
        });
        dialog.overlay.querySelector('.mermaid-editor-cancel').click();
        expect(mainView.state.doc.toString()).toBe(markdown);
        expect(document.activeElement).toBe(mainView.contentDOM);

        const reopened = openMermaidEditor(mainView, scanDiagramFences(mainView.state.doc)[0], {
            parse: source => Promise.resolve({ diagramType: source.startsWith('flowchart') ? 'flowchart-v2' : '' }),
            render: source => Promise.resolve(`<svg>${source}</svg>`),
            catalog: [{
                id: 'flowchart-v2', name: 'Flowchart', description: '',
                examples: [{ id: 'flow', title: 'Basic', code: 'flowchart TD\n A --> B' }],
            }],
            session: { validationDelay: 400 },
        });
        reopened.editorView.dispatch({
            changes: { from: 0, to: reopened.editorView.state.doc.length, insert: 'flowchart LR\n  X --> Y' },
        });
        reopened.overlay.querySelector('.mermaid-editor-apply').click();
        expect(mainView.state.doc.toString()).toContain('```mermaid\nflowchart LR\n  X --> Y\n```');
        expect(undo(mainView)).toBe(true);
        expect(mainView.state.doc.toString()).toBe(markdown);
    });

    test('draws diagnostics, keeps the last good SVG, and still permits applying invalid source', async () => {
        const { dialog, parse } = open();
        jest.advanceTimersByTime(400);
        await flush();
        expect(dialog.overlay.querySelector('.mermaid-editor-preview svg')).not.toBeNull();

        parse.mockRejectedValueOnce(Object.assign(new Error('Parse error'), {
            hash: { loc: { first_line: 1, first_column: 0, last_column: 4 } },
        }));
        dialog.editorView.dispatch({
            changes: { from: 0, to: dialog.editorView.state.doc.length, insert: 'broken diagram' },
        });
        jest.advanceTimersByTime(400);
        await flush();

        expect(dialog.overlay.querySelector('.mermaid-editor-preview svg')).not.toBeNull();
        expect(dialog.overlay.querySelector('.mermaid-editor-preview').classList.contains('is-stale')).toBe(true);
        expect(dialog.overlay.querySelector('.mermaid-editor-stale-notice').hidden).toBe(false);
        expect(dialog.overlay.querySelector('.mermaid-editor-apply').textContent).toBe('Apply');
        expect(dialog.editorView.dom.querySelector('.cm-lintRange-error')).not.toBeNull();

        dialog.overlay.querySelector('.mermaid-editor-apply').click();
        expect(mainView.state.doc.toString()).toContain('```mermaid\nbroken diagram\n```');
    });
});
