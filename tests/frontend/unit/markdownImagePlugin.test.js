import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cursorLineDown, cursorLineUp } from '@codemirror/commands';
import { collapseOnSelectionFacet, mouseSelectingField } from 'codemirror-live-markdown';

import {
    createMarkdownImageField,
    parseMarkdownImageSyntax,
} from '../frontend/js/markdownImagePlugin.js';

const source = 'Before\n![Flow](flow.drawio.svg)\nAfter';

function createView({
    imageResult = { loaded: false },
    resolveDrawioState = jest.fn(async () => ({ kind: 'create' })),
    onCreateDrawio = jest.fn(async () => false),
    onOpenDrawio = jest.fn(async () => false),
} = {}) {
    const loadImage = jest.fn(async () => imageResult);
    const drawioTarget = jest.fn(path => path.endsWith('.drawio.svg')
        ? { path: `Notes/${path}`, title: path }
        : null);
    const view = new EditorView({
        parent: document.body,
        state: EditorState.create({
            doc: source,
            selection: { anchor: 0 },
            extensions: [
                markdown(),
                collapseOnSelectionFacet.of(true),
                mouseSelectingField,
                createMarkdownImageField({
                    loadImage,
                    drawioTarget,
                    resolveDrawioState,
                    onCreateDrawio,
                    onOpenDrawio,
                }),
            ],
        }),
    });
    return {
        view,
        loadImage,
        drawioTarget,
        resolveDrawioState,
        onCreateDrawio,
        onOpenDrawio,
    };
}

async function settle() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('actionable Draw.io Markdown images', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    test('parses supported image source, alternative, and title text', () => {
        expect(parseMarkdownImageSyntax('![Flow](flow.drawio.svg "System")')).toEqual({
            alt: 'Flow',
            src: 'flow.drawio.svg',
            title: 'System',
        });
        expect(parseMarkdownImageSyntax('[Flow](flow.drawio.svg)')).toBeNull();
    });

    test('offers one accessible action and keeps the source unchanged while creating', async () => {
        const {
            view,
            loadImage,
            drawioTarget,
            resolveDrawioState,
            onCreateDrawio,
        } = createView();
        await settle();
        const button = view.dom.querySelector('.cm-drawio-action-button');
        expect(button).not.toBeNull();
        expect(button.classList.contains('ui-button--accent')).toBe(true);
        expect(button.getAttribute('aria-label')).toBe('Create Draw.io diagram flow.drawio.svg');

        button.click();
        expect(button.disabled).toBe(true);
        expect(button.getAttribute('aria-busy')).toBe('true');
        await settle();

        expect(loadImage).toHaveBeenCalledWith(
            expect.stringMatching(/^\/vault\/Notes\/flow\.drawio\.svg\?figaro-preview=\d+$/),
            { basePath: '' },
        );
        expect(drawioTarget).toHaveBeenCalledWith('flow.drawio.svg');
        expect(resolveDrawioState).toHaveBeenCalledWith({
            path: 'Notes/flow.drawio.svg',
            title: 'flow.drawio.svg',
        });
        expect(onCreateDrawio).toHaveBeenCalledWith({
            path: 'Notes/flow.drawio.svg',
            title: 'flow.drawio.svg',
        });
        expect(view.state.doc.toString()).toBe(source);
        expect(view.state.selection.main.head).toBe(0);
        expect(button.disabled).toBe(false);
        expect(button.textContent).toBe('Create Draw.io diagram');
        view.destroy();
    });

    test('turns a successful mounted creation action into a reusable Open action', async () => {
        const onCreateDrawio = jest.fn(async () => true);
        const onOpenDrawio = jest.fn(async () => true);
        const { view } = createView({ onCreateDrawio, onOpenDrawio });
        await settle();
        const button = view.dom.querySelector('.cm-drawio-action-button');

        button.click();
        await settle();
        expect(onCreateDrawio).toHaveBeenCalledTimes(1);
        expect(button.disabled).toBe(false);
        expect(button.hasAttribute('aria-busy')).toBe(false);
        expect(button.textContent).toBe('Open Draw.io diagram');
        expect(button.getAttribute('aria-label')).toBe('Open Draw.io diagram flow.drawio.svg');

        button.click();
        await settle();
        expect(onOpenDrawio).toHaveBeenCalledWith({
            path: 'Notes/flow.drawio.svg',
            title: 'flow.drawio.svg',
        });
        expect(button.disabled).toBe(false);
        expect(button.textContent).toBe('Open Draw.io diagram');
        view.destroy();
    });

    test('offers Open when the failed preview belongs to an existing blank diagram', async () => {
        const resolveDrawioState = jest.fn(async () => ({ kind: 'open' }));
        const onCreateDrawio = jest.fn(async () => true);
        const onOpenDrawio = jest.fn(async () => true);
        const { view } = createView({ resolveDrawioState, onCreateDrawio, onOpenDrawio });
        await settle();
        const button = view.dom.querySelector('.cm-drawio-action-button');

        expect(button.getAttribute('aria-label')).toBe('Open Draw.io diagram flow.drawio.svg');
        button.click();
        await settle();
        expect(onOpenDrawio).toHaveBeenCalledTimes(1);
        expect(onCreateDrawio).not.toHaveBeenCalled();
        view.destroy();
    });

    test('restores a saved SVG preview when the vault image request previously failed', async () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"></svg>';
        const sourceURL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        const resolveDrawioState = jest.fn(async () => ({
            kind: 'preview',
            source: sourceURL,
        }));
        const { view } = createView({ resolveDrawioState });
        await settle();

        const image = view.dom.querySelector('.cm-image-widget img');
        expect(image).not.toBeNull();
        expect(image.getAttribute('src')).toBe(sourceURL);
        expect(view.dom.querySelector('.cm-drawio-action-button')).toBeNull();
        view.destroy();
    });

    test('remounts the failed image when file activation changes it from blank to saved SVG', async () => {
        const field = new Compartment();
        const loadImage = jest.fn(async () => ({ loaded: false }));
        const drawioTarget = path => ({ path: `Notes/${path}`, title: path });
        let drawioState = { kind: 'open' };
        const extension = () => createMarkdownImageField({
            loadImage,
            drawioTarget,
            resolveDrawioState: async () => drawioState,
        });
        const view = new EditorView({
            parent: document.body,
            state: EditorState.create({
                doc: source,
                selection: { anchor: 0 },
                extensions: [
                    markdown(),
                    collapseOnSelectionFacet.of(true),
                    mouseSelectingField,
                    field.of(extension()),
                ],
            }),
        });
        await settle();
        expect(view.dom.querySelector('.cm-drawio-action-button')).not.toBeNull();

        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"></svg>';
        drawioState = {
            kind: 'preview',
            source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        };
        view.dispatch({ effects: field.reconfigure(extension()) });
        await settle();

        expect(view.dom.querySelector('.cm-image-widget img')).not.toBeNull();
        expect(view.dom.querySelector('.cm-drawio-action-button')).toBeNull();
        view.destroy();
    });

    test('retains ordinary image errors and reveals their source on selection', async () => {
        const ordinary = source.replace('flow.drawio.svg', 'missing.png');
        const view = new EditorView({
            parent: document.body,
            state: EditorState.create({
                doc: ordinary,
                selection: { anchor: 0 },
                extensions: [
                    markdown(),
                    collapseOnSelectionFacet.of(true),
                    mouseSelectingField,
                    createMarkdownImageField({ loadImage: async () => ({ loaded: false }) }),
                ],
            }),
        });
        await settle();
        expect(view.dom.querySelector('.cm-image-error')).not.toBeNull();
        expect(view.dom.querySelector('.cm-drawio-action-button')).toBeNull();
        view.dispatch({ selection: { anchor: ordinary.indexOf('missing.png') } });
        await settle();
        expect(view.dom.querySelector('.cm-image-error')).toBeNull();
        expect(view.state.doc.toString()).toBe(ordinary);
        view.destroy();
    });

    test('moves vertically across the rendered action from both directions', async () => {
        const { view } = createView();
        await settle();
        view.dispatch({ selection: { anchor: source.indexOf('Before') } });
        expect(cursorLineDown(view)).toBe(true);
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(3);
        expect(cursorLineUp(view)).toBe(true);
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(1);
        view.destroy();
    });
});
