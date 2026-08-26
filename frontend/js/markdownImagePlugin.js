import { foldedRanges, syntaxTree } from '@codemirror/language';
import { StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import {
    loadImage as loadMarkdownImage,
    mouseSelectingField,
    shouldShowSource,
} from 'codemirror-live-markdown';
import {
    drawioImageVaultURL,
    parseMarkdownImageSyntax,
} from './core/drawioImageCreationModel.js';

export { parseMarkdownImageSyntax } from './core/drawioImageCreationModel.js';

let markdownImageFieldRevision = 0;

class MarkdownImageWidget extends WidgetType {
    constructor(data, options) {
        super();
        this.data = data;
        this.options = options;
    }

    eq(other) {
        return other.data.src === this.data.src
            && other.data.alt === this.data.alt
            && other.data.title === this.data.title
            && other.options.basePath === this.options.basePath
            && other.options.renderToken === this.options.renderToken;
    }

    toDOM() {
        const container = document.createElement('div');
        container.className = 'cm-image-widget';
        const loading = document.createElement('div');
        loading.className = 'cm-image-loading';
        loading.innerHTML = '<span class="cm-image-spinner"></span><span>Loading…</span>';
        container.appendChild(loading);

        const drawioTarget = this.options.drawioTarget?.(this.data.src) || null;
        const drawioURL = drawioImageVaultURL(drawioTarget, this.options.renderToken);
        const loadSource = drawioURL || this.data.src;
        const loadOptions = { basePath: drawioURL ? '' : this.options.basePath };
        Promise.resolve(this.options.loadImage(loadSource, loadOptions))
            .then(result => {
                loading.remove();
                if (result?.loaded) {
                    this.renderImage(container, result.src);
                    return;
                }
                this.renderFailedLoad(container, drawioTarget);
            })
            .catch(() => {
                loading.remove();
                this.renderFailedLoad(container, drawioTarget);
            });
        return container;
    }

    async renderFailedLoad(container, target) {
        if (!target) {
            this.renderError(container);
            return;
        }
        const checking = document.createElement('div');
        checking.className = 'cm-image-loading';
        checking.innerHTML = '<span class="cm-image-spinner"></span><span>Checking diagram…</span>';
        container.appendChild(checking);
        let state;
        try {
            state = await this.options.resolveDrawioState(target);
        } catch {
            state = { kind: 'error' };
        }
        checking.remove();
        if (state?.kind === 'preview' && state.source) {
            this.renderImage(container, state.source);
        } else if (state?.kind === 'create' || state?.kind === 'open') {
            this.renderDrawioAction(container, target, state.kind);
        } else {
            this.renderError(container, 'Failed to inspect Draw.io diagram');
        }
    }

    renderImage(container, source) {
        const image = document.createElement('img');
        image.src = source;
        image.alt = this.data.alt;
        image.title = this.data.title || '';
        image.style.maxWidth = '100%';
        image.draggable = false;
        container.appendChild(image);

        if (this.data.alt) {
            const alternative = document.createElement('div');
            alternative.className = 'cm-image-alt';
            alternative.textContent = this.data.alt;
            container.appendChild(alternative);
        }
    }

    renderError(container, text = 'Failed to load image') {
        const error = document.createElement('div');
        error.className = 'cm-image-error';
        const icon = document.createElement('span');
        icon.className = 'cm-image-error-icon';
        icon.textContent = '⚠';
        icon.setAttribute('aria-hidden', 'true');
        const message = document.createElement('span');
        message.textContent = text;
        error.append(icon, message);
        container.appendChild(error);
    }

    renderDrawioAction(container, target, initialAction) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ui-button ui-button--accent cm-drawio-action-button';
        const showAction = action => {
            const verb = action === 'open' ? 'Open' : 'Create';
            button.dataset.drawioAction = action;
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = `${verb} Draw.io diagram`;
            button.setAttribute('aria-label', `${verb} Draw.io diagram ${target.title}`);
        };
        showAction(initialAction);
        button.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            if (button.disabled) return;
            const action = button.dataset.drawioAction;
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            const activity = action === 'open' ? 'Opening diagram…' : 'Creating diagram…';
            button.innerHTML = `<span class="ui-spinner" aria-hidden="true"></span><span>${activity}</span>`;
            let succeeded = false;
            try {
                const callback = action === 'open'
                    ? this.options.onOpenDrawio
                    : this.options.onCreateDrawio;
                succeeded = await callback?.(target) === true;
            } catch {
                succeeded = false;
            } finally {
                if (button.isConnected) {
                    showAction(action === 'create' && succeeded ? 'open' : action);
                }
            }
        });
        container.appendChild(button);
    }

    ignoreEvent(event) {
        return Boolean(event?.target?.closest?.('.cm-drawio-action-button'));
    }
}

function imageDecorations(state, options) {
    const decorations = [];
    const dragging = state.field(mouseSelectingField, false);
    syntaxTree(state).iterate({
        enter(node) {
            if (node.name !== 'Image') return;
            const data = parseMarkdownImageSyntax(state.sliceDoc(node.from, node.to));
            if (!data) return;
            let folded = false;
            foldedRanges(state).between(node.from, node.to, (from, to) => {
                if (from === node.from && to === node.to) folded = true;
            });
            if (!folded && !shouldShowSource(state, node.from, node.to) && !dragging) {
                decorations.push(Decoration.replace({
                    widget: new MarkdownImageWidget(data, options),
                    block: true,
                }).range(node.from, node.to));
                return;
            }
            decorations.push(Decoration.line({ class: 'cm-image-source' }).range(state.doc.lineAt(node.from).from));
        },
    });
    return Decoration.set(decorations.sort((left, right) => left.from - right.from), true);
}

/** Create Figaro's image preview with an actionable missing Draw.io state. */
export function createMarkdownImageField({
    basePath = '',
    drawioTarget = () => null,
    resolveDrawioState = async () => ({ kind: 'create' }),
    onCreateDrawio = async () => false,
    onOpenDrawio = async () => false,
    loadImage = loadMarkdownImage,
} = {}) {
    const options = {
        basePath,
        drawioTarget,
        resolveDrawioState,
        onCreateDrawio,
        onOpenDrawio,
        loadImage,
        // A fresh field configuration represents a deliberate file activation.
        // Keep ordinary selection updates reusable, but remount image widgets
        // when returning from an editor that may have changed their files.
        renderToken: ++markdownImageFieldRevision,
    };
    return StateField.define({
        create: state => imageDecorations(state, options),
        update(decorations, transaction) {
            if (transaction.docChanged || transaction.reconfigured) {
                return imageDecorations(transaction.state, options);
            }
            const dragging = transaction.state.field(mouseSelectingField, false);
            const wasDragging = transaction.startState.field(mouseSelectingField, false);
            if (wasDragging && !dragging) return imageDecorations(transaction.state, options);
            if (dragging) return decorations;
            if (foldedRanges(transaction.startState) !== foldedRanges(transaction.state)) {
                return imageDecorations(transaction.state, options);
            }
            return transaction.selection
                ? imageDecorations(transaction.state, options)
                : decorations;
        },
        provide: field => EditorView.decorations.from(field),
    });
}
