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

    function open(source = 'flowchart TD\n  A --> B', tabSize = 4, nodes = [{id:'A'}, {id:'B'}]) {
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
        const parse = jest.fn(source => Promise.resolve({
            diagramType: source.includes('sequenceDiagram') ? 'sequence' : 'flowchart-v2',
            nodes,
        }));
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
        expect(dialog.overlay.querySelector('.custom-modal-resize-handle').getAttribute('aria-label'))
            .toBe('Resize editor dialog');
        expect(templateButton.disabled).toBe(false);
        expect(templateButton.classList.contains('ui-button')).toBe(true);
        expect(templateButton.classList.contains('ui-button--quiet')).toBe(false);

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
        const confirmation = dialog.overlay.querySelector('.mermaid-editor-discard');
        expect(confirmation.hidden).toBe(false);
        expect(mainView.state.doc.toString()).toBe(markdown);
        confirmation.querySelector('.custom-modal-pending-discard').click();
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

    test('routes focused-editor Escape through dirty draft confirmation', () => {
        const { markdown, dialog } = open();
        dialog.editorView.dispatch({
            changes: { from: dialog.editorView.state.doc.length, insert: '\nC --> D' },
        });
        dialog.editorView.contentDOM.focus();

        dialog.editorView.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        }));

        const confirmation = dialog.overlay.querySelector('.mermaid-editor-discard');
        expect(confirmation.hidden).toBe(false);
        expect(document.activeElement).toBe(confirmation.querySelector('.custom-modal-pending-keep'));
        expect(dialog.overlay.isConnected).toBe(true);
        expect(mainView.state.doc.toString()).toBe(markdown);

        confirmation.querySelector('.custom-modal-pending-discard').click();
        expect(dialog.overlay.isConnected).toBe(false);
        expect(mainView.state.doc.toString()).toBe(markdown);
    });

    test('draws diagnostics, keeps the last good SVG, and still permits applying invalid source', async () => {
        const { dialog, parse } = open();
        jest.advanceTimersByTime(400);
        await flush();
        expect(dialog.overlay.querySelector('.mermaid-editor-preview svg')).not.toBeNull();
        expect(dialog.overlay.querySelector('.mermaid-editor-preview').classList.contains('is-application-themed')).toBe(true);

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

    test('switches between source and adaptive styling without hiding parser errors', async () => {
        const { dialog, parse } = open('flowchart LR\n  Idea[Idea] --> Draft(Draft)', 4, [{id:'Idea'}, {id:'Draft'}]);
        expect([...dialog.overlay.querySelectorAll('.mermaid-editor-combobox')]
            .every(control => control.classList.contains('ui-picker--quiet'))).toBe(true);
        expect([...dialog.overlay.querySelectorAll('.ui-segmented-control')]
            .every(control => control.classList.contains('ui-segmented-control--quiet'))).toBe(true);
        jest.advanceTimersByTime(400);
        await flush();

        const styleTab = dialog.overlay.querySelector('.mermaid-editor-mode-control [role="tab"]:last-child');
        styleTab.click();
        expect(styleTab.getAttribute('aria-selected')).toBe('true');
        expect(dialog.overlay.querySelector('.mermaid-editor-style-content').hidden).toBe(false);
        expect(dialog.overlay.querySelector('[data-diagram-type="flowchart-v2"]')).not.toBeNull();
        expect([...dialog.overlay.querySelectorAll('.ui-segmented-control')]
            .every(control => control.classList.contains('ui-segmented-control--quiet'))).toBe(true);
        expect([...dialog.overlay.querySelectorAll('.mermaid-editor-node-name')].map(node => node.textContent))
            .toEqual(['Idea', 'Draft']);

        parse.mockRejectedValueOnce(new Error('Broken source'));
        dialog.editorView.dispatch({
            changes: { from: 0, to: dialog.editorView.state.doc.length, insert: 'broken' },
        });
        jest.advanceTimersByTime(400);
        await flush();
        expect(dialog.overlay.querySelector('.mermaid-editor-style-content').textContent)
            .toContain('Fix the Mermaid source error');

        dialog.overlay.querySelector('.mermaid-editor-mode-control [role="tab"]:first-child').click();
        expect(dialog.overlay.querySelector('.mermaid-editor-source-content').hidden).toBe(false);
        expect(document.activeElement).toBe(dialog.editorView.contentDOM);

        const sourceTab = dialog.overlay.querySelector('#mermaid-editor-source-tab');
        sourceTab.focus();
        sourceTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(dialog.overlay.querySelector('.mermaid-editor-style-content').hidden).toBe(false);
        expect(document.activeElement).toBe(styleTab);
        expect(styleTab.tabIndex).toBe(0);
        expect(sourceTab.tabIndex).toBe(-1);
    });

    test('writes theme, type colors, node shape, and connection settings as native Mermaid source', async () => {
        const { dialog } = open('flowchart LR\n  Idea[Idea] --> Draft(Draft)', 4, [{id:'Idea'}, {id:'Draft'}]);
        jest.advanceTimersByTime(400);
        await flush();
        dialog.overlay.querySelector('.mermaid-editor-mode-control [role="tab"]:last-child').click();

        const accent = [...dialog.overlay.querySelectorAll('.mermaid-editor-style-section .ui-button')]
            .find(button => button.textContent === 'Accent');
        accent.click();
        expect(dialog.editorView.state.doc.toString()).toContain("theme: 'base'");
        expect(dialog.editorView.state.doc.toString()).toContain('themeVariables:');

        const draftRow = [...dialog.overlay.querySelectorAll('.mermaid-editor-node-row')]
            .find(row => row.textContent.includes('Draft'));
        draftRow.click();
        dialog.overlay.querySelector('.mermaid-editor-selected-node .mermaid-editor-color-button').click();
        const blue = document.querySelector('.kanban-color-picker [data-color="#3b82f6"]');
        expect(blue).not.toBeNull();
        blue.click();
        expect(dialog.editorView.state.doc.toString())
            .toContain('style Draft fill:#3b82f6,stroke:#2a5eb1,color:#111827');
        const pill = [...dialog.overlay.querySelectorAll('.mermaid-editor-selected-node .ui-button')]
            .find(button => button.textContent === 'Pill');
        pill.click();
        expect(dialog.editorView.state.doc.toString()).toContain('Draft@{ shape: stadium }');

        const straight = [...dialog.overlay.querySelectorAll('.mermaid-editor-style-section .ui-button')]
            .find(button => button.textContent === 'Straight');
        straight.click();
        expect(dialog.editorView.state.doc.toString()).toContain("curve: 'linear'");
        expect(dialog.editorView.state.doc.toString().match(/%% Figaro node styles/gu)).toHaveLength(1);
    });

    test('keeps individual node controls before a bounded keyboard-operable node list', async () => {
        const { dialog } = open([
            'flowchart LR',
            '  A[Christmas] --> B[Go shopping] --> C[Let me think] --> D[Laptop]',
            '  D --> E[iPhone] --> F[Car] --> G[Home]',
            '%% Figaro node styles',
            '  B@{ shape: stadium }',
            '%% End Figaro node styles',
        ].join('\n'), 4, ['Christmas','Go shopping','Let me think','Laptop','iPhone','Car','Home'].map((text,index) => ({id:'ABCDEFG'[index],text})));
        jest.advanceTimersByTime(400);
        await flush();
        dialog.overlay.querySelector('.mermaid-editor-mode-control [role="tab"]:last-child').click();

        const stylePanel = dialog.overlay.querySelector('.mermaid-editor-style-content');
        const selectedControls = stylePanel.querySelector('.mermaid-editor-selected-node');
        const nodeList = stylePanel.querySelector('.mermaid-editor-node-list');
        const rows = [...nodeList.querySelectorAll('.mermaid-editor-node-row')];
        expect(stylePanel.textContent).toContain('Default node color');
        expect(stylePanel.textContent).toContain('Connection color');
        expect(stylePanel.textContent).toContain('Connection curve');
        expect(stylePanel.textContent).toContain('Select a node below or in the preview');
        expect(selectedControls.getAttribute('aria-label')).toBe('Editing node Christmas');
        expect([...selectedControls.children].map(child => child.className)).toEqual([
            'mermaid-editor-selected-node-heading',
            'mermaid-editor-style-control mermaid-editor-selected-node-shape',
            'mermaid-editor-selected-node-color',
        ]);
        expect(selectedControls.compareDocumentPosition(nodeList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(rows).toHaveLength(7);
        expect(rows.map(row => row.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1]);
        expect(rows.every(row => row.classList.contains('ui-menu-item'))).toBe(true);
        expect([...rows[0].children].map(child => child.className)).toEqual([
            'mermaid-editor-node-identity',
            'mermaid-editor-node-shape',
            'mermaid-editor-node-swatch',
        ]);
        expect(rows[0].querySelector('.mermaid-editor-node-shape').textContent).toBe('Original');
        expect(rows[1].querySelector('.mermaid-editor-node-shape').textContent).toBe('Pill');
        expect(selectedControls.querySelector('.mermaid-editor-color-button').classList.contains('ui-icon-button')).toBe(true);

        nodeList.scrollTop = 24;
        rows[0].focus();
        rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        const refreshedList = stylePanel.querySelector('.mermaid-editor-node-list');
        const selectedRow = stylePanel.querySelector('.mermaid-editor-node-row[aria-selected="true"]');
        expect(selectedRow.dataset.nodeId).toBe('B');
        expect(selectedRow.tabIndex).toBe(0);
        expect(document.activeElement).toBe(selectedRow);
        expect(refreshedList.scrollTop).toBe(24);
        expect(stylePanel.querySelector('.mermaid-editor-selected-node').getAttribute('aria-label'))
            .toBe('Editing node Go shopping');
    });

    test('replaces type-specific controls after a valid template changes the diagram type', async () => {
        const { dialog } = open('');
        const diagramSelect = dialog.overlay.querySelector('.mermaid-editor-diagram-select');
        jest.advanceTimersByTime(400);
        await flush();
        dialog.overlay.querySelector('.mermaid-editor-mode-control [role="tab"]:last-child').click();
        expect(dialog.overlay.querySelector('[data-diagram-type="flowchart-v2"]')).not.toBeNull();

        diagramSelect.value = 'sequence';
        diagramSelect.dispatchEvent(new Event('change', { bubbles: true }));
        jest.advanceTimersByTime(400);
        await flush();

        expect(dialog.overlay.querySelector('[data-diagram-type="sequence"]')).not.toBeNull();
        expect(dialog.overlay.querySelector('.mermaid-editor-style-content').textContent).toContain('Participants');
        expect(dialog.overlay.querySelector('.mermaid-editor-style-content').textContent).toContain('Messages');
        expect(dialog.overlay.querySelector('.mermaid-editor-node-list')).toBeNull();
    });

    test('preserves style-control focus and an open palette through validation and preview updates', async () => {
        const {dialog} = open();
        jest.advanceTimersByTime(400);
        await flush();
        dialog.overlay.querySelector('#mermaid-editor-style-tab').click();
        const pill = dialog.overlay.querySelector('[data-style-focus="Shape:stadium"]');
        pill.focus();
        pill.click();
        expect(document.activeElement.dataset.styleFocus).toBe('Shape:stadium');
        const color = dialog.overlay.querySelector('.mermaid-editor-selected-node .mermaid-editor-color-button');
        color.click();
        const picker = document.querySelector('.kanban-color-picker');
        jest.advanceTimersByTime(400);
        await flush();
        expect(color.isConnected).toBe(true);
        expect(picker.isConnected).toBe(true);
        picker.querySelector('[data-color="#3b82f6"]').click();
        expect(document.activeElement.dataset.styleFocus).toBe('A fill');
        expect(dialog.editorView.state.doc.toString()).toContain('style A fill:#3b82f6');
        dialog.overlay.querySelector('.mermaid-editor-selected-node .mermaid-editor-color-button').click();
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
        expect(dialog.overlay.isConnected).toBe(true);
        expect(document.querySelector('.kanban-color-picker')).toBeNull();
        expect(document.activeElement.dataset.styleFocus).toBe('A fill');
        dialog.overlay.querySelector('.mermaid-editor-selected-node .mermaid-editor-color-button').click();
        dialog.close();
        expect(document.querySelector('.kanban-color-picker')).toBeNull();
        dialog.overlay.querySelector('.custom-modal-pending-discard').click();
    });

    test('synchronizes a reset XY palette in place after inspection without leaving stale swatches', async () => {
        const source = "---\nconfig:\n  theme: 'dark'\n  themeVariables:\n    xyChart:\n      plotColorPalette: '#ef4444,#3b82f6'\n---\nxychart-beta\n bar [1,2]\n line [2,3]";
        const {dialog,parse} = open(source);
        const snapshot = palette => ({diagramType:'xychart',plots:[{type:'bar'},{type:'line'}],
            effectiveVariables:{xyChart:{plotColorPalette:palette}}});
        parse.mockResolvedValueOnce(snapshot('#ef4444,#3b82f6'));
        jest.advanceTimersByTime(400);
        await flush();
        dialog.overlay.querySelector('#mermaid-editor-style-tab').click();
        const firstPlot = () => dialog.overlay.querySelector('[data-style-focus="Bar 1 color"]');
        expect(firstPlot().dataset.colorValue).toBe('#ef4444');
        firstPlot().click();
        document.querySelector('.kanban-color-picker [data-color=""]').click();
        const anchor = firstPlot();
        expect(dialog.editorView.state.doc.toString()).not.toContain('plotColorPalette');
        expect(dialog.editorView.state.doc.toString()).toContain("theme: 'dark'");
        parse.mockResolvedValueOnce(snapshot('#111111,#222222'));
        jest.advanceTimersByTime(400);
        await flush();
        expect(firstPlot()).toBe(anchor);
        expect(anchor.dataset.colorValue).toBe('#111111');
        expect(anchor.getAttribute('aria-label')).toBe('Bar 1 color: #111111');
    });
});
