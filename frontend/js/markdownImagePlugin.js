import { foldedRanges, syntaxTree } from '@codemirror/language';
import { StateField, Transaction } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import {
    loadImage as loadMarkdownImage,
    mouseSelectingField,
    shouldShowSource,
} from 'codemirror-live-markdown';
import { drawioImageVaultURL } from './core/drawioImageCreationModel.js';
import {
    clearMarkdownImageSize,
    markdownImageDisplaySize,
    markdownImageResizePlan,
    parseMarkdownImageSyntax,
    setMarkdownImageSize,
} from './core/markdownImageModel.js';

export { parseMarkdownImageSyntax } from './core/markdownImageModel.js';

let markdownImageFieldRevision = 0;

class MarkdownImageWidget extends WidgetType {
    constructor(data, options) {
        super();
        this.data = data;
        this.options = options;
    }

    eq(other) {
        return other.data.source === this.data.source
            && other.data.src === this.data.src
            && other.data.alt === this.data.alt
            && other.data.title === this.data.title
            && other.options.basePath === this.options.basePath
            && other.options.renderToken === this.options.renderToken;
    }

    get estimatedHeight() {
        return this.data.height || -1;
    }

    updateDOM(container, view) {
        const controller = container._figaroImageController;
        if (!controller
            || controller.data.src !== this.data.src
            || controller.data.alt !== this.data.alt
            || controller.data.title !== this.data.title
            || controller.options.basePath !== this.options.basePath
            || controller.options.renderToken !== this.options.renderToken) return false;
        controller.view = view;
        controller.data = this.data;
        controller.options = this.options;
        const image = container.querySelector('.cm-image-resize-frame img');
        if (image) {
            image.alt = this.data.alt;
            image.title = this.data.title || '';
        }
        if (controller.originalWidth && controller.originalHeight) {
            this.applyRequestedGeometry(container);
        }
        return true;
    }

    toDOM(view) {
        const container = document.createElement('div');
        container.className = 'cm-image-widget';
        container._figaroImageController = {
            view,
            data: this.data,
            options: this.options,
            originalWidth: 0,
            originalHeight: 0,
        };
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
                    this.renderImage(container, result.src, result);
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

    maximumHorizontalWidth(container) {
        const frame = container.querySelector('.cm-image-resize-frame');
        const containerRect = container.getBoundingClientRect();
        const frameRect = frame?.getBoundingClientRect?.();
        const measured = frameRect && containerRect.right > frameRect.left
            ? containerRect.right - frameRect.left
            : container.clientWidth;
        const fallback = this.data.width
            || container._figaroImageController?.originalWidth
            || frameRect?.width
            || 1;
        return Math.max(1, measured > 0 ? measured : fallback);
    }

    maximumProportionalHeight(container) {
        const controller = container._figaroImageController;
        const frame = container.querySelector('.cm-image-resize-frame');
        const frameRect = frame?.getBoundingClientRect?.();
        const editorRect = controller?.view?.scrollDOM?.getBoundingClientRect?.();
        const measured = frameRect && editorRect && editorRect.bottom > frameRect.top
            ? editorRect.bottom - frameRect.top
            : frameRect?.height;
        return Math.max(1, measured || controller?.originalHeight || 1);
    }

    applyFrameGeometry(container, geometry) {
        const controller = container._figaroImageController;
        const frame = container.querySelector('.cm-image-resize-frame');
        if (!controller || !frame) return;
        const width = Math.max(1, Math.round(geometry.width));
        const height = Math.max(1, Math.round(geometry.height));
        frame.style.width = `${width}px`;
        frame.style.height = `${height}px`;
        frame.dataset.imageWidth = String(width);
        frame.dataset.imageHeight = String(height);
        frame.querySelector('.cm-image-resize-readout').textContent = `${width} × ${height}`;
        controller.width = width;
        controller.height = height;
        controller.options.geometryCache.set(controller.data.source, { width, height });
    }

    applyRequestedGeometry(container) {
        const controller = container._figaroImageController;
        if (!controller?.originalWidth || !controller?.originalHeight) return;
        this.applyFrameGeometry(container, markdownImageDisplaySize({
            width: controller.data.width,
            height: controller.data.height,
            originalWidth: controller.originalWidth,
            originalHeight: controller.originalHeight,
            availableWidth: this.maximumHorizontalWidth(container),
        }));
    }

    currentSourceRange(container) {
        const controller = container._figaroImageController;
        const view = controller?.view;
        if (!view || view.isDestroyed) return null;
        let position = controller.data.from;
        try {
            const mapped = view.posAtDOM(container, 0);
            if (Number.isInteger(mapped)) position = mapped;
        } catch (_) { /* a detached widget cannot start a resize */ }
        let range = null;
        syntaxTree(view.state).iterate({
            from: Math.max(0, position - 1),
            to: Math.min(view.state.doc.length, position + 1),
            enter(node) {
                if (node.name === 'Image' && node.from <= position && node.to >= position) {
                    range = { from: node.from, to: node.to };
                }
            },
        });
        if (!range && Number.isInteger(controller.data.from) && Number.isInteger(controller.data.to)) {
            range = { from: controller.data.from, to: controller.data.to };
        }
        return range;
    }

    writeGeometryToSource(container, geometry) {
        const controller = container._figaroImageController;
        const view = controller?.view;
        const range = this.currentSourceRange(container);
        if (!view || view.isDestroyed || !range) return false;
        const source = view.state.sliceDoc(range.from, range.to);
        const insert = setMarkdownImageSize(source, geometry.width, geometry.height);
        if (insert === source) return false;
        view.dispatch({
            annotations: Transaction.userEvent.of('image.resize'),
            changes: { from: range.from, to: range.to, insert },
        });
        return true;
    }

    createResizeHandle(container, mode, label) {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'ui-image-resize-handle cm-image-resize-handle';
        handle.dataset.resizeMode = mode;
        handle.dataset.uiTooltip = label;
        handle.setAttribute('aria-label', label);
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const controller = container._figaroImageController;
            const frame = container.querySelector('.cm-image-resize-frame');
            if (!controller || !frame || !controller.width || !controller.height) return;
            const handles = [...container.querySelectorAll('.cm-image-resize-handle')];
            for (const candidate of handles) {
                candidate._figaroResizeTooltip = candidate.dataset.uiTooltip;
                candidate.removeAttribute('data-ui-tooltip');
            }
            container.classList.add('is-resizing');
            controller.view?.dom?.classList.add('cm-image-resizing');
            handle.setPointerCapture?.(event.pointerId);
            const start = {
                x: event.clientX,
                y: event.clientY,
                width: controller.width,
                height: controller.height,
                maximumWidth: this.maximumHorizontalWidth(container),
                maximumProportionalHeight: this.maximumProportionalHeight(container),
                originalWidth: controller.originalWidth,
                originalHeight: controller.originalHeight,
            };

            const move = moveEvent => {
                const geometry = markdownImageResizePlan({
                    mode,
                    startWidth: start.width,
                    startHeight: start.height,
                    deltaX: moveEvent.clientX - start.x,
                    deltaY: moveEvent.clientY - start.y,
                    maximumWidth: start.maximumWidth,
                    maximumProportionalHeight: start.maximumProportionalHeight,
                    originalWidth: start.originalWidth,
                    originalHeight: start.originalHeight,
                });
                this.applyFrameGeometry(container, geometry);
            };

            const finish = endEvent => {
                container.classList.remove('is-resizing');
                controller.view?.dom?.classList.remove('cm-image-resizing');
                const geometryChanged = controller.width !== start.width
                    || controller.height !== start.height;
                if (endEvent.type === 'pointerup' && geometryChanged) {
                    this.writeGeometryToSource(container, {
                        width: controller.width,
                        height: controller.height,
                    });
                } else {
                    this.applyFrameGeometry(container, {
                        width: start.width,
                        height: start.height,
                    });
                }
                if (handle.hasPointerCapture?.(endEvent.pointerId)) {
                    handle.releasePointerCapture(endEvent.pointerId);
                }
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', finish);
                handle.removeEventListener('pointercancel', finish);
                for (const candidate of handles) {
                    if (candidate._figaroResizeTooltip) {
                        candidate.dataset.uiTooltip = candidate._figaroResizeTooltip;
                        delete candidate._figaroResizeTooltip;
                    }
                }
            };
            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', finish);
            handle.addEventListener('pointercancel', finish);
        });
        return handle;
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

    renderImage(container, source, result = {}) {
        const controller = container._figaroImageController;
        if (!controller) return;
        const frame = document.createElement('div');
        frame.className = 'cm-image-resize-frame';
        const image = document.createElement('img');
        image.src = source;
        image.alt = controller.data.alt;
        image.title = controller.data.title || '';
        image.draggable = false;
        const readout = document.createElement('output');
        readout.className = 'cm-image-resize-readout';
        readout.setAttribute('aria-live', 'polite');
        frame.append(
            image,
            readout,
            this.createResizeHandle(container, 'width', 'Resize image width'),
            this.createResizeHandle(container, 'height', 'Resize image height'),
            this.createResizeHandle(container, 'proportional', 'Resize image proportionally'),
        );
        container.appendChild(frame);

        const setOriginalGeometry = () => {
            const current = container._figaroImageController;
            if (!current) return;
            current.originalWidth = Math.max(1, Math.round(result.width || image.naturalWidth || 1));
            current.originalHeight = Math.max(1, Math.round(result.height || image.naturalHeight || 1));
            this.applyRequestedGeometry(container);
        };
        if (result.width && result.height) setOriginalGeometry();
        else image.addEventListener('load', setOriginalGeometry, { once: true });
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
        return Boolean(event?.target?.closest?.(
            '.cm-drawio-action-button, .cm-image-resize-handle',
        ));
    }
}

function imageDecorations(state, options) {
    const decorations = [];
    const dragging = state.field(mouseSelectingField, false);
    syntaxTree(state).iterate({
        enter(node) {
            if (node.name !== 'Image') return;
            const source = state.sliceDoc(node.from, node.to);
            const parsed = parseMarkdownImageSyntax(source);
            const data = parsed ? { ...parsed, source, from: node.from, to: node.to } : null;
            if (!data) return;
            let folded = false;
            foldedRanges(state).between(node.from, node.to, (from, to) => {
                if (from === node.from && to === node.to) folded = true;
            });
            if (folded) return;
            if (!shouldShowSource(state, node.from, node.to) && !dragging) {
                decorations.push(Decoration.replace({
                    widget: new MarkdownImageWidget(data, options),
                    block: true,
                }).range(node.from, node.to));
                return;
            }
            const geometry = options.geometryCache.get(source)
                || (data.width && data.height ? { width: data.width, height: data.height } : null);
            const lineDecoration = geometry
                ? Decoration.line({
                    class: 'cm-image-source cm-image-source-placeholder',
                    attributes: {
                        style: `--cm-image-source-width:${geometry.width}px;--cm-image-source-height:${geometry.height}px`,
                    },
                })
                : Decoration.line({ class: 'cm-image-source' });
            decorations.push(lineDecoration.range(state.doc.lineAt(node.from).from));
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
        geometryCache: new Map(),
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

/** Remove an authored size hint and let the mounted widget return to intrinsic geometry. */
export function resetMarkdownImageSize(view, from, to) {
    if (!view || view.isDestroyed) return false;
    const safeFrom = Math.max(0, Math.min(Number(from) || 0, view.state.doc.length));
    const safeTo = Math.max(safeFrom, Math.min(Number(to) || safeFrom, view.state.doc.length));
    const source = view.state.sliceDoc(safeFrom, safeTo);
    const image = parseMarkdownImageSyntax(source);
    if (!image?.width || !image?.height) return false;
    const insert = clearMarkdownImageSize(source);
    view.dispatch({
        annotations: Transaction.userEvent.of('image.resize.reset'),
        changes: { from: safeFrom, to: safeTo, insert },
    });
    view.focus();
    return true;
}
