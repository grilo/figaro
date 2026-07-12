import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import {
    frontmatterTemplateChange,
    frontmatterPropertyChange,
    getPrintStylesheet,
    hasLeadingFrontmatter,
    parseFrontmatter,
    parseFrontmatterScalar,
    stripLeadingFrontmatter,
} from '../frontend/js/frontmatter.js';
import { createFrontmatterField } from '../frontend/js/frontmatterPlugin.js';

describe('frontmatter parsing', () => {
    test('reads leading scalar properties without rewriting YAML', () => {
        const source = '---\ntitle: "Quarterly report"\nprint-stylesheet: ../styles/print.css # shared export style\ntags:\n  - planning\n---\n# Report';
        const frontmatter = parseFrontmatter(source);

        expect(frontmatter).toMatchObject({
            from: 0,
            entries: [
                { key: 'title', value: 'Quarterly report' },
                { key: 'print-stylesheet', value: '../styles/print.css' },
                { key: 'tags', value: '' },
            ],
        });
        expect(getPrintStylesheet(source)).toBe('../styles/print.css');
        expect(stripLeadingFrontmatter(source)).toBe('# Report');
    });

    test('leaves ordinary Markdown and unclosed fences untouched', () => {
        expect(parseFrontmatter('# Not frontmatter\n---')).toBeNull();
        expect(stripLeadingFrontmatter('---\ntitle: unfinished')).toBe('---\ntitle: unfinished');
        expect(hasLeadingFrontmatter('---\ntitle: unfinished')).toBe(true);
        expect(hasLeadingFrontmatter('# Not frontmatter\n---')).toBe(false);
        const quote = String.fromCharCode(39);
        expect(parseFrontmatterScalar(quote + 'it' + quote + quote + 's local.css' + quote))
            .toBe('it' + quote + 's local.css');
    });

    test('updates one scalar or creates a PDF-properties template without rewriting unrelated YAML', () => {
        const source = '---\ntitle: Old title # preserve this comment\nnested:\n  enabled: true\n---\n# Body';
        const titleChange = frontmatterPropertyChange(source, 'title', 'New title');
        const afterTitle = source.slice(0, titleChange.from) + titleChange.insert + source.slice(titleChange.to);

        expect(afterTitle).toBe('---\ntitle: "New title" # preserve this comment\nnested:\n  enabled: true\n---\n# Body');

        const tocChange = frontmatterPropertyChange(afterTitle, 'toc-depth', '2');
        const afterToc = afterTitle.slice(0, tocChange.from) + tocChange.insert + afterTitle.slice(tocChange.to);
        expect(afterToc).toContain('  enabled: true\ntoc-depth: 2\n---');

        const coverSource = '---\ncover-page: true\n---\n# Body';
        const coverChange = frontmatterPropertyChange(coverSource, 'cover-page', 'false');
        expect(coverSource.slice(0, coverChange.from) + coverChange.insert + coverSource.slice(coverChange.to))
            .toBe('---\ncover-page: false\n---\n# Body');

        expect(frontmatterTemplateChange('~~~markdown\n# Ignore this\n~~~\n# Quarterly report\n\nBody', {
            author: 'Ada Lovelace',
            date: '2026-07-12',
        })).toMatchObject({
            insert: '---\ntitle: "Quarterly report"\nsubtitle: ""\nauthor: "Ada Lovelace"\ndate: 2026-07-12\ncover-page: false\ntoc-depth: 0\nprint-stylesheet: "pdf.css"\n---\n\n',
        });
        expect(frontmatterTemplateChange('', { author: 'ada', date: '2026-07-12' })).toMatchObject({
            insert: '---\ntitle: ""\nsubtitle: ""\nauthor: ada\ndate: 2026-07-12\ncover-page: false\ntoc-depth: 0\nprint-stylesheet: "pdf.css"\n---\n',
        });
    });
});

describe('frontmatter Properties card', () => {
    let view;

    afterEach(() => {
        view?.destroy();
        view = null;
        document.body.innerHTML = '';
    });

    test('is collapsed initially, exposes friendly PDF controls, and keeps raw YAML available', () => {
        const field = createFrontmatterField(
            StateField,
            StateEffect,
            EditorView,
            Decoration,
            WidgetType,
            null,
            () => ['exports/print.css', 'styles/print.css']
        );
        const source = '---\ntitle: Report\ndescription: A concise summary\ncreated: 2026-07-11\nprint-stylesheet: styles/print.css\n---\n# Body';
        view = new EditorView({
            state: EditorState.create({ doc: source, extensions: [field] }),
            parent: document.body,
        });

        const card = view.dom.querySelector('.cm-frontmatter');
        expect(card).not.toBeNull();
        expect(card.textContent).toContain('Properties');
        expect(card.textContent).toContain('4 properties');

        card.click();
        expect(view.dom.querySelector('.cm-frontmatter')).toBeNull();
        expect(view.dom.querySelector('.cm-frontmatter-panel')).not.toBeNull();
        expect(view.dom.querySelector('.cm-frontmatter-panel').classList.contains('cm-frontmatter-panel--enter')).toBe(true);
        expect(view.dom.querySelector('.cm-frontmatter-panel').textContent).toContain('PDF layout');
        expect(view.dom.querySelector('.cm-frontmatter-panel-chips').textContent).toContain('title: Report');
        const stylesheetToggle = view.dom.querySelector('.cm-frontmatter-combobox-toggle');
        stylesheetToggle.click();
        expect([...view.dom.querySelectorAll('.cm-frontmatter-file-combobox .cm-frontmatter-combobox-option')]
            .map(option => option.dataset.value))
            .toEqual(['exports/print.css', 'styles/print.css']);
        [...view.dom.querySelectorAll('.cm-frontmatter-file-combobox .cm-frontmatter-combobox-option')]
            .find(option => option.dataset.value === 'exports/print.css')
            .click();
        expect(view.state.doc.toString()).toContain('print-stylesheet: exports/print.css');

        const toc = view.dom.querySelector('.cm-frontmatter-panel-select');
        toc.click();
        [...view.dom.querySelectorAll('.cm-frontmatter-combobox-option')]
            .find(option => option.dataset.value === '2')
            .click();
        expect(view.state.doc.toString()).toContain('toc-depth: 2');

        const cover = view.dom.querySelector('.cm-frontmatter-panel-toggle');
        cover.checked = true;
        cover.dispatchEvent(new Event('change', { bubbles: true }));
        expect(view.state.doc.toString()).toContain('cover-page: true');
        expect(view.dom.querySelector('.cm-frontmatter-panel').textContent).toContain('Cover details');
        expect([...view.dom.querySelectorAll('.cm-frontmatter-panel-input')].map(input => input.value))
            .toEqual(expect.arrayContaining(['A concise summary', '2026-07-11']));

        const uncheckedCover = view.dom.querySelector('.cm-frontmatter-panel-toggle');
        uncheckedCover.checked = false;
        uncheckedCover.dispatchEvent(new Event('change', { bubbles: true }));
        expect(view.state.doc.toString()).toContain('cover-page: false');

        const recheckedCover = view.dom.querySelector('.cm-frontmatter-panel-toggle');
        recheckedCover.checked = true;
        recheckedCover.dispatchEvent(new Event('change', { bubbles: true }));
        expect(view.state.doc.toString()).toContain('cover-page: true');

        const title = [...view.dom.querySelectorAll('.cm-frontmatter-panel-input')]
            .find(input => input.value === 'Report');
        title.value = 'Revised report';
        title.dispatchEvent(new Event('change', { bubbles: true }));
        expect(view.state.doc.toString()).toContain('title: "Revised report"');

        const yamlButton = [...view.dom.querySelectorAll('.cm-frontmatter-panel-action')]
            .find(button => button.textContent === 'Edit YAML');
        yamlButton.click();
        expect(view.dom.querySelector('.cm-frontmatter-panel')).toBeNull();
        expect(view.state.selection.main.head).toBe(source.indexOf('title:'));

        view.dispatch({ selection: { anchor: view.state.doc.length } });
        expect(view.dom.querySelector('.cm-frontmatter')).not.toBeNull();
    });

    test('adds an editable PDF-properties YAML template for notes without frontmatter', async () => {
        const field = createFrontmatterField(
            StateField,
            StateEffect,
            EditorView,
            Decoration,
            WidgetType,
            null,
            () => [],
            () => 'Ada Lovelace'
        );
        view = new EditorView({
            state: EditorState.create({ doc: '# Body', extensions: [field] }),
            parent: document.body,
        });

        const add = view.dom.querySelector('.cm-add-properties');
        expect(add).not.toBeNull();
        let editorMouseDowns = 0;
        view.contentDOM.addEventListener('mousedown', () => { editorMouseDowns++; });
        add.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(editorMouseDowns).toBe(0);
        expect(add.isConnected).toBe(true);
        add.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        const template = view.state.doc.toString();
        expect(template).toContain('title: Body');
        expect(template).toContain('subtitle: ""');
        expect(template).toContain('author: "Ada Lovelace"');
        expect(template).toMatch(/date: \d{4}-\d{2}-\d{2}/);
        expect(template).toContain('cover-page: false');
        expect(template).toContain('toc-depth: 0');
        expect(template).toContain('print-stylesheet: "pdf.css"');
        expect(template.endsWith('---\n\n# Body')).toBe(true);
        expect(view.dom.querySelector('.cm-frontmatter-panel')).toBeNull();
        expect(view.dom.querySelector('.cm-frontmatter')).toBeNull();
        expect(view.state.selection.main.head).toBe(template.indexOf('subtitle: "') + 'subtitle: "'.length);
        expect(view.dom.querySelectorAll('.cm-frontmatter-source-line')).toHaveLength(2);
    });

    test('does not offer a second properties block while YAML is being typed', () => {
        const field = createFrontmatterField(StateField, StateEffect, EditorView, Decoration, WidgetType, null);
        view = new EditorView({
            state: EditorState.create({ doc: '---\ntitle: unfinished', extensions: [field] }),
            parent: document.body,
        });

        expect(view.dom.querySelector('.cm-add-properties')).toBeNull();
        expect(view.dom.querySelector('.cm-frontmatter')).toBeNull();
        expect(view.dom.textContent).toContain('title: unfinished');
    });
});
