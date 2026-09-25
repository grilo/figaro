import { markdownProjectionEdit, collapseOnSelectionFacet } from 'codemirror-live-markdown';
import { sourceRevealIndex, updateSourceReveal, patchSourceReveal } from './sourceReveal.js';
import { countEditorWork, readEditorDocument } from './editorDiagnostics.js';
/**
 * Live diagram preview for Mermaid, Vega, and Vega-Lite fenced code blocks.
 *
 * Diagram fences are owned exclusively by this extension. The regular
 * codeBlockField is configured to skip these languages in editor.js, which
 * prevents two replacement decorations from competing for the same range.
 *
 * Block-replacement decorations affect editor layout, so CodeMirror requires
 * them to come from a StateField rather than a ViewPlugin.
 */
import { log } from './log.js';
import { foldedRanges } from '@codemirror/language';
import { Transaction } from '@codemirror/state';
import { ViewPlugin } from '@codemirror/view';
import { diagramLanguages, diagramRenderIdentity, renderDiagramSVG } from './diagramRenderer.js';
import { wrapBlockWidget } from './blockWidget.js';
import { markSourceFootprint } from './sourceFootprint.js';
import { createDiagramRenderQueue } from './usecases/diagramRenderQueue.js';
import { DIAGRAM_QUIET_MS, scheduleDiagramAfterQuiet } from './usecases/diagramQuietScheduler.js';
import { vegaRenderDimensions, vegaUsesContainerSize } from './core/diagramRenderCacheModel.js';
import { createPreviewCache } from './core/previewCache.js';
import { createDiagramPresentation, diagramSourceBoxHeight, mermaidSizeKeys } from './diagramPresentation.js';
import { createDiagramSizeMemory } from './adapters/diagramSizeMemory.js';

export { diagramLanguages };

const DIAGRAM_LANGS = new Set(diagramLanguages);

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

function parseFenceOpener(line) {
    const match = line.match(FENCE_OPEN_RE);
    if (!match) return null;

    const info = match[2].trim();
    return {
        marker: match[1][0],
        length: match[1].length,
        language: info.split(/\s+/, 1)[0].toLowerCase(),
    };
}

function parseFenceCloser(line) {
    const match = line.match(FENCE_CLOSE_RE);
    if (!match) return null;
    return { marker: match[1][0], length: match[1].length };
}

/**
 * Scan fenced blocks directly from the document rather than relying only on
 * the syntax tree. CodeMirror correctly follows CommonMark's requirement
 * that a closing fence be at least as long as its opener. In a live editor,
 * though, a mistaken six-backtick opener followed by a normal three-backtick
 * closer should not make every later diagram disappear.
 *
 * For diagram blocks only, a shorter bare closing fence is recovered as the
 * likely intended closer. The widget labels that recovery, while normal
 * Markdown semantics (including deliberate six-fence nesting in regular
 * code blocks) remain intact.
 */
export function scanDiagramFences(doc) {
    countEditorWork('parse.diagrams');
    const diagrams = [];
    let open = null;
    const source = readEditorDocument(doc, 'diagrams');
    if (!/\b(?:mermaid|vega(?:-lite)?)\b/iu.test(source)) return diagrams;

    const finish = (closeLine, recoveredFence) => {
        if (DIAGRAM_LANGS.has(open.language)) {
            const code = [];
            for (let lineNumber = open.lineNumber + 1; lineNumber < closeLine.number; lineNumber++) {
                code.push(doc.line(lineNumber).text);
            }
            const contentFrom = open.lineNumber < closeLine.number
                ? doc.line(open.lineNumber + 1).from
                : closeLine.from;
            const contentTo = closeLine.from;
            diagrams.push({
                from: open.from,
                to: closeLine.to,
                lineFrom: open.from,
                contentFrom,
                contentTo,
                lang: open.language,
                code: code.join('\n').trim(),
                rawCode: doc.sliceString(contentFrom, contentTo).replace(/\r?\n$/u, ''),
                sourceText: doc.sliceString(open.from, closeLine.to),
                recoveredFence,
                sourceLines: closeLine.number - open.lineNumber + 1,
            });
        }
        open = null;
    };

    for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
        const line = doc.line(lineNumber);
        if (!open) {
            const opener = parseFenceOpener(line.text);
            if (!opener) continue;
            open = { ...opener, from: line.from, lineNumber };
            continue;
        }

        const closer = parseFenceCloser(line.text);
        if (!closer || closer.marker !== open.marker) continue;

        if (closer.length >= open.length) {
            finish(line, false);
        } else if (DIAGRAM_LANGS.has(open.language) && closer.length >= 3) {
            // Be forgiving for a likely accidental longer opener. This is
            // intentionally scoped to diagrams so regular code can still use
            // longer fences to contain literal triple-backtick examples.
            finish(line, true);
        }
    }

    return diagrams;
}

function setMessage(container, className, text) {
    const message = document.createElement('div');
    message.className = className;
    message.textContent = text;
    container.replaceChildren(message);
}

const DIAGRAM_IDLE_TIMEOUT = 500;
const pendingViewActivity = new WeakMap();
const preparedDiagramPreviews = new WeakMap();

function diagramPreviewSession(view) {
    if (!view?.dom) return null;
    let session = preparedDiagramPreviews.get(view);
    if (!session) {
        session = { active: true, repeatedInput: false, lastInput: 0,
            cache: createPreviewCache({ maximumEntries: 32, maximumWeight: 4 * 1024 * 1024 }) };
        preparedDiagramPreviews.set(view, session);
    }
    return session;
}

const preparedDiagramPreviewExtension = ViewPlugin.define(view => {
    const session = diagramPreviewSession(view);
    const input = event => {
        session.repeatedInput = event.repeat;
        session.lastInput = view.dom.ownerDocument.defaultView.performance.now();
    };
    view.dom.addEventListener('keydown', input, true);
    return { destroy() {
        view.dom.removeEventListener('keydown', input, true);
        session.active = false;
        session.cache.clear();
        preparedDiagramPreviews.delete(view);
    } };
});

function scheduleDiagramIdle(callback, view) {
    const win = view?.dom?.ownerDocument?.defaultView || globalThis;
    if (!view?.scrollDOM) {
        const handle = win.setTimeout(callback, 0);
        return { cancel: () => win.clearTimeout(handle) };
    }

    return scheduleDiagramAfterQuiet(callback, {
        now: () => win.performance.now(),
        setTimer: (run, delay) => win.setTimeout(run, delay),
        clearTimer: handle => win.clearTimeout(handle),
        requestIdle: run => typeof win.requestIdleCallback === 'function'
            ? win.requestIdleCallback(run, { timeout: DIAGRAM_IDLE_TIMEOUT })
            : win.setTimeout(run, 0),
        cancelIdle: handle => typeof win.cancelIdleCallback === 'function'
            ? win.cancelIdleCallback(handle) : win.clearTimeout(handle),
        isBusy: () => view.composing,
        observeActivity: activity => {
            pendingViewActivity.set(view, activity);
            const events = [
                [view.scrollDOM, 'scroll'], [view.scrollDOM, 'wheel'],
                [view.contentDOM, 'keydown'], [view.contentDOM, 'beforeinput'],
                [view.contentDOM, 'input'], [view.contentDOM, 'compositionstart'],
                [view.contentDOM, 'compositionupdate'], [view.contentDOM, 'compositionend'],
            ];
            events.forEach(([target, event]) => target?.addEventListener(event, activity, { passive: true }));
            return () => {
                if (pendingViewActivity.get(view) === activity) pendingViewActivity.delete(view);
                events.forEach(([target, event]) => target?.removeEventListener(event, activity));
            };
        },
    });
}

function createDiagramWidget(WidgetType, renderQueue, sizeMemory) {
    return class DiagramWidget extends WidgetType {
        constructor(
            lang,
            code,
            recoveredFence = false,
            sourceLines = 1,
            sourceText = '',
            from = 0,
            to = 0,
            sourceIdentity = null,
            boxHint = 0,
        ) {
            super();
            this.lang = lang;
            this.code = code;
            this.recoveredFence = recoveredFence;
            this.sourceLines = sourceLines;
            this.sourceText = sourceText;
            this.from = from;
            this.to = to;
            this.sourceIdentity = sourceIdentity;
            this.presentation = createDiagramPresentation({ lang, code, sizeMemory, boxHint });
            this.destroyed = false;
            this.renderVersion = 0;
            this.renderTask = null;
            this.stopSettle = null;
        }

        // Every geometry input derives from the source, so equal sources
        // share a mounted widget.
        eq(other) {
            return other instanceof DiagramWidget &&
                other.lang === this.lang &&
                other.code === this.code &&
                other.recoveredFence === this.recoveredFence &&
                other.sourceLines === this.sourceLines &&
                other.sourceText === this.sourceText;
        }

        currentBlock(view, root) {
            let position = this.from;
            try {
                const mapped = view.posAtDOM(root, 0);
                if (Number.isInteger(mapped)) position = mapped;
            } catch (_) { /* a detached widget cannot commit a resize */ }
            return scanDiagramFences(view.state.doc).find(block => (
                block.lang === this.lang
                && block.from <= position
                && block.to >= position
            )) || scanDiagramFences(view.state.doc).find(block => (
                block.lang === this.lang && block.from === this.from
            )) || null;
        }

        createDiagramResizeHandle(view, root, anchor) {
            const presentation = this.presentation;
            const handle = document.createElement('button');
            handle.type = 'button';
            handle.className = `ui-image-resize-handle cm-diagram-resize-handle cm-${presentation.kind}-resize-handle`;
            handle.dataset.uiTooltip = presentation.label;
            handle.setAttribute('aria-label', presentation.label);
            const readout = document.createElement('output');
            readout.className = `cm-diagram-resize-readout cm-${presentation.kind}-resize-readout`;
            readout.setAttribute('aria-live', 'polite');
            handle.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                const start = { y: event.clientY, ...presentation.start(root) };
                let currentHeight = start.height;
                const tooltip = handle.dataset.uiTooltip;
                handle.removeAttribute('data-ui-tooltip');
                root.classList.add('is-resizing');
                view.dom.classList.add('cm-diagram-resizing');
                if (presentation.viewClass) view.dom.classList.add(presentation.viewClass);
                handle.setPointerCapture?.(event.pointerId);

                const move = moveEvent => {
                    currentHeight = presentation.plan(start.height, moveEvent.clientY - start.y, start.maxHeight);
                    presentation.apply(root, currentHeight);
                };
                const finish = endEvent => {
                    root.classList.remove('is-resizing');
                    view.dom.classList.remove('cm-diagram-resizing');
                    if (presentation.viewClass) view.dom.classList.remove(presentation.viewClass);
                    const changed = currentHeight !== start.height;
                    const block = endEvent.type === 'pointerup' && changed ? this.currentBlock(view, root) : null;
                    const source = block ? (block.rawCode ?? block.code) : '';
                    const replacement = block ? presentation.replacement(source, currentHeight, view.state.lineBreak) : '';
                    if (replacement && replacement !== source) {
                        view.dispatch({
                            changes: { from: block.contentFrom, to: block.contentTo, insert: `${replacement}${view.state.lineBreak}` },
                            annotations: Transaction.userEvent.of(presentation.userEvent),
                        });
                    } else {
                        presentation.restore(root);
                    }
                    if (handle.hasPointerCapture?.(endEvent.pointerId)) {
                        handle.releasePointerCapture(endEvent.pointerId);
                    }
                    handle.removeEventListener('pointermove', move);
                    handle.removeEventListener('pointerup', finish);
                    handle.removeEventListener('pointercancel', finish);
                    if (tooltip) handle.dataset.uiTooltip = tooltip;
                };
                handle.addEventListener('pointermove', move);
                handle.addEventListener('pointerup', finish);
                handle.addEventListener('pointercancel', finish);
            });
            anchor.append(handle);
            root.append(readout);
        }

        toDOM(view) {
            this.destroyed = false;
            this.renderVersion += 1;
            this.previewSession = diagramPreviewSession(view);
            const dom = document.createElement('div');
            dom.className = 'cm-live-diagram';
            dom.dataset.lang = this.lang;
            if (this.recoveredFence) dom.dataset.recoveredFence = 'true';
            dom.setAttribute('aria-label', this.lang + ' diagram');

            const label = document.createElement('div');
            label.className = 'cm-live-diagram-label';
            label.textContent = this.recoveredFence ? this.lang + ' · recovered fence' : this.lang;
            if (this.recoveredFence) {
                label.title = 'The closing fence has fewer backticks than its opener. Use matching fence lengths to keep the Markdown portable.';
            }

            const content = document.createElement('div');
            content.className = 'cm-live-diagram-view';
            content.setAttribute('aria-live', 'polite');
            dom.append(label, content);
            const wrapper = wrapBlockWidget(dom, 'cm-block-widget--diagram');
            const presentation = this.presentation;
            const { target, anchor } = presentation.mount(wrapper, content);
            setMessage(target, 'cm-live-diagram-loading', 'Rendering ' + this.lang + '…');
            markSourceFootprint(wrapper, {
                kind: this.lang,
                lineCount: this.sourceLines,
                lineHeight: view?.defaultLineHeight,
                sourceText: this.sourceText,
            });
            if (presentation.resizable) {
                this.createDiagramResizeHandle(view, wrapper, anchor);
                presentation.initialize(wrapper);
            }
            const requestRender = () => {
                if (this.destroyed) return;
                const version = ++this.renderVersion;
                this.renderTask?.cancel?.();
                this.completedPreview = null;
                // The widget must be connected before checking responsive width.
                // A prepared preview returns before paint; only missing output
                // enters the quiet queue used for expensive generation.
                queueMicrotask(() => {
                    if (this.destroyed || version !== this.renderVersion) return;
                    const session = this.previewSession;
                    const repeating = session?.repeatedInput
                        && content.ownerDocument.defaultView.performance.now() - session.lastInput < DIAGRAM_QUIET_MS;
                    if (((repeating && presentation.deferDuringKeyRepeat) || view?.composing)
                        && session?.cache.get(this.sourceIdentity)) {
                        // Some presentations restore after a key-repeat burst;
                        // the rest restore immediately. Composition keeps every
                        // path out of the active input region.
                        this.renderTask = renderQueue.enqueue(() => {
                            if (this.destroyed || version !== this.renderVersion) return;
                            if (!this.restorePreview(target, wrapper)) return this.renderInto(target, wrapper, version);
                        }, view);
                        return;
                    }
                    if (this.restorePreview(target, wrapper)) return;
                    this.renderTask = renderQueue.enqueue(() => this.renderInto(target, wrapper, version), view);
                });
            };
            // Container width and appearance are render inputs, even while the
            // source remains unchanged. Invalidate pending output immediately;
            // generate its replacement through the same quiet queue.
            let width = vegaRenderDimensions(content.clientWidth || wrapper.clientWidth).width;
            let responsive = false;
            if (this.lang !== 'mermaid') {
                // Vega output depends on the container width.
                try { responsive = vegaUsesContainerSize(JSON.parse(this.code)); } catch (_) { /* render reports malformed source */ }
            }
            const resize = responsive && typeof ResizeObserver === 'function'
                ? new ResizeObserver(() => {
                    const next = vegaRenderDimensions(content.clientWidth || wrapper.clientWidth).width;
                    if (next === width) return;
                    width = next;
                    requestRender();
                }) : null;
            resize?.observe(content);
            const doc = content.ownerDocument;
            doc.addEventListener('figaro:appearance-changed', requestRender);
            doc.fonts?.addEventListener('loadingdone', requestRender);
            doc.fonts?.addEventListener('loadingerror', requestRender);
            this.stopRenderObservation?.();
            this.stopRenderObservation = () => {
                resize?.disconnect();
                this.stopSettle?.();
                this.stopSettle = null;
                doc.removeEventListener('figaro:appearance-changed', requestRender);
                doc.fonts?.removeEventListener('loadingdone', requestRender);
                doc.fonts?.removeEventListener('loadingerror', requestRender);
            };
            requestRender();
            return wrapper;
        }

        renderOptions(container, root) {
            return {
                appearance: this.presentation.appearance,
                containerWidth: container.clientWidth || root.clientWidth,
            };
        }

        fitPreview(container, root, preview) {
            preview.graphic.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            this.stopSettle?.();
            this.stopSettle = this.presentation.settle(root, container, preview.graphic);
            this.completedPreview = preview;
        }

        restorePreview(container, root) {
            const preview = this.previewSession?.cache.take(this.sourceIdentity);
            if (!preview) return false;
            try {
                const identity = diagramRenderIdentity(this.lang, this.code, this.renderOptions(container, root));
                if (!identity || identity.key !== preview.identity.key || identity.renderer !== preview.identity.renderer) return false;
                container.replaceChildren(preview.graphic);
                this.fitPreview(container, root, preview);
                countEditorWork('dom.diagramPreviewRestored');
                return true;
            } catch (_) {
                // Rendering owns the visible error; a failed identity check must
                // never reuse stale output or bypass the normal error path.
                return false;
            }
        }

        async renderInto(container, root, version = ++this.renderVersion) {
            if (this.destroyed || version !== this.renderVersion) return;

            try {
                const options = this.renderOptions(container, root);
                const identity = diagramRenderIdentity(this.lang, this.code, options);
                const svg = await renderDiagramSVG(this.lang, this.code, 'figaro-live-diagram', options);
                if (this.destroyed || version !== this.renderVersion) return;

                if (typeof svg !== 'string' || !svg) {
                    setMessage(container, 'cm-live-diagram-error', 'Diagram renderer is unavailable');
                    this.presentation.fail(root);
                    root.dataset.sourceFootprintState = 'underflow';
                    return;
                }

                countEditorWork('dom.diagramSVGParse');
                container.innerHTML = svg;
                const graphic = container.querySelector('svg');
                if (graphic) {
                    this.fitPreview(container, root, { graphic, identity,
                        weight: identity ? 2 * (svg.length + identity.key.length)
                            + 256 * (graphic.querySelectorAll('*').length + 1) : 0,
                    });
                }
            } catch (error) {
                if (this.destroyed || version !== this.renderVersion) return;
                log.warn('[diagram] ' + this.lang + ' render error: ' + (error.message || error));
                setMessage(container, 'cm-live-diagram-error', 'Unable to render ' + this.lang + ' diagram');
                this.presentation.fail(root);
                root.dataset.sourceFootprintState = 'underflow';
            }
        }

        // Let a click on the preview move the cursor back into the source.
        ignoreEvent(event) {
            return Boolean(event?.target?.closest?.('.cm-diagram-resize-handle'));
        }

        destroy() {
            this.destroyed = true;
            this.renderVersion++;
            this.renderTask?.cancel?.();
            this.stopRenderObservation?.();
            this.stopSettle?.();
            const preview = this.completedPreview;
            this.completedPreview = null;
            if (preview?.identity && this.sourceIdentity && this.previewSession?.active
                && this.previewSession.cache.set(this.sourceIdentity, preview, preview.weight)) {
                // Retain only the SVG subtree. Wrappers and their input handlers
                // belong to the old mount and must not survive through the cache.
                preview.graphic.remove();
            }
        }
    };
}

/**
 * Tell the size memory which layout measured box heights belong to. Heights
 * depend on the column width and line height; an entry from another layout
 * would give revealed source the wrong height. The observer is created with
 * the view, before any widget's box observer, so within one delivery the
 * layout changes before widgets record their new heights.
 */
function diagramLayoutTracker(sizeMemory) {
    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.width = 0;
            this.lineHeight = view.defaultLineHeight;
            this.observer = typeof ResizeObserver === 'function'
                ? new ResizeObserver(entries => {
                    const width = Math.round(entries.at(-1)?.contentRect?.width || 0);
                    if (width === this.width) return;
                    this.width = width;
                    this.publish();
                })
                : null;
            this.observer?.observe(view.contentDOM);
            this.publish();
        }

        publish() {
            sizeMemory.setLayout(`${this.width}:${this.lineHeight}`);
        }

        update(update) {
            if (update.view.defaultLineHeight === this.lineHeight) return;
            this.lineHeight = update.view.defaultLineHeight;
            this.publish();
        }

        destroy() {
            this.observer?.disconnect();
        }
    });
}

/**
 * Build the live-preview state field for diagram block decorations.
 * `sizeMemory` remembers diagram sizes across mounts; the composition root
 * passes a persistent one, and each field otherwise keeps its own.
 */
export function createDiagramField(
    StateField,
    EditorView,
    Decoration,
    WidgetType,
    shouldShowSource,
    mouseSelectingField,
    { sizeMemory = createDiagramSizeMemory({ storage: null }) } = {},
) {
    const renderQueue = createDiagramRenderQueue({
        schedule: scheduleDiagramIdle,
        cancel: handle => handle?.cancel?.(),
        onError: error => log.warn('[diagram] queued render error: ' + (error.message || error)),
    });
    const DiagramWidget = createDiagramWidget(WidgetType, renderQueue, sizeMemory);

    const sourceRangeIsFolded = (state, block) => {
        const foldFrom = state.doc.lineAt(block.from).to;
        let found = false;
        foldedRanges(state).between(foldFrom, block.to, (from, to) => {
            if (from === foldFrom && to === block.to) found = true;
        });
        return found;
    };

    const projectBlock = (state, block, sourceVisible) => {
        const decorations = [];
        const isDragging = state.field(mouseSelectingField, false);
        const folded = sourceRangeIsFolded(state, block);
        if (!block.code || isDragging || sourceVisible || folded) {
            // Revealed source keeps the rendered box's height, so the
            // following text stays put while the cursor enters or leaves.
            const height = sourceVisible && !folded ? diagramSourceBoxHeight(sizeMemory, block) : 0;
            if (height) {
                const firstLine = state.doc.lineAt(block.from).number;
                const lastLine = state.doc.lineAt(block.to).number;
                for (let number = firstLine; number <= lastLine; number += 1) {
                    const opener = number === firstLine;
                    decorations.push(Decoration.line({
                        sourceBlock: block.sourceIdentity || block,
                        class: `${block.lang === 'mermaid' ? 'cm-mermaid-diagram-source-line' : 'cm-vega-lite-chart-source-line'} cm-diagram-source-line${opener ? ' cm-diagram-source-placeholder' : ''}${opener && block.lang === 'vega-lite' ? ' cm-vega-lite-chart-source-placeholder' : ''}${opener && block.lang === 'mermaid' ? ' cm-mermaid-diagram-source-placeholder' : ''}`,
                        attributes: opener ? {
                            style: `--cm-diagram-source-height:calc(${height}px - ${lastLine - firstLine}lh)`,
                        } : undefined,
                    }).range(state.doc.line(number).from));
                }
            }
            return decorations;
        }
        decorations.push(Decoration.replace({
            widget: new DiagramWidget(
                block.lang,
                block.code,
                block.recoveredFence,
                block.sourceLines,
                block.sourceText,
                block.from,
                block.to,
                block.sourceIdentity || block,
                block.lang === 'mermaid' ? block.boxHint || 0 : 0,
            ),
            block: true, sourceBlock: block.sourceIdentity || block,
        }).range(block.from, block.to));
        return decorations;
    };

    // An edited Mermaid fence keeps the box of the diagram it replaced until
    // its new drawing renders, so typing in revealed source does not resize it.
    const inheritBoxHeights = (previous, replacements, changes) => {
        for (const block of replacements) {
            if (block.lang !== 'mermaid') continue;
            const prior = previous.find(old => old.lang === 'mermaid'
                && changes.mapPos(old.from, -1) <= block.to && changes.mapPos(old.to, 1) >= block.from);
            const height = prior && (sizeMemory.boxHeight(mermaidSizeKeys(prior.code).box) || prior.boxHint);
            if (height) block.boxHint = height;
        }
    };

    const buildState = (state, blocks = scanDiagramFences(state.doc)) => {
        const visibleIndices = new Set();
        const decorations = blocks.flatMap((block, index) => {
            const visible = Boolean(shouldShowSource(state, block.from, block.to));
            if (visible) visibleIndices.add(index);
            return projectBlock(state, block, visible);
        });
        return {
            decorations: Decoration.set(decorations, true),
            ranges: blocks.map(({ from, to }) => ({ from, to })),
            blocks, visibleIndices, revealIndex: sourceRevealIndex(blocks),
        };
    };

    const changesNeedDiagramRescan = (value, transaction) => {
        let needsRescan = false;
        transaction.changes.iterChanges((fromA, toA, fromB, toB) => {
            if (needsRescan) return;
            const before = transaction.startState.doc.sliceString(fromA, toA);
            const after = transaction.state.doc.sliceString(fromB, toB);
            if (/[`~]/.test(before) || /[`~]/.test(after)
                || value.ranges.some(range => fromA <= range.to && toA >= range.from)) {
                needsRescan = true;
            }
        });
        return needsRescan;
    };

    const mapState = (value, changes) => ({
        ...value,
        decorations: value.decorations.map(changes),
        ranges: value.ranges.map(range => ({
            from: changes.mapPos(range.from, -1),
            to: changes.mapPos(range.to, 1),
        })),
        blocks: value.blocks.map(block => ({
            ...block, sourceIdentity: block.sourceIdentity || block,
            from: changes.mapPos(block.from, -1),
            to: changes.mapPos(block.to, 1),
            lineFrom: changes.mapPos(block.lineFrom, -1),
            contentFrom: changes.mapPos(block.contentFrom, -1),
            contentTo: changes.mapPos(block.contentTo, 1),
        })),
    });

    return StateField.define({
        create: buildState,
        update(value, transaction) {
            if (transaction.startState.facet(collapseOnSelectionFacet) !== transaction.state.facet(collapseOnSelectionFacet)
                && !transaction.docChanged) return buildState(transaction.state, value.blocks);
            if (transaction.docChanged) {
                if (changesNeedDiagramRescan(value, transaction)) {
                    const regions = markdownProjectionEdit(transaction);
                    if (!regions || regions.some(region => region.name === 'FencedCode' && !region.topLevel)) {
                        const blocks = scanDiagramFences(transaction.state.doc);
                        inheritBoxHeights(value.blocks, blocks, transaction.changes);
                        return buildState(transaction.state, blocks);
                    }
                    const fences = regions.filter(region => region.name === 'FencedCode');
                    const replacements = fences.flatMap(region => scanDiagramFences(
                        transaction.state.doc.slice(region.nextFrom, region.nextTo),
                    ).map(block => ({ ...block,
                        from: block.from + region.nextFrom, to: block.to + region.nextFrom,
                        lineFrom: block.lineFrom + region.nextFrom,
                        contentFrom: block.contentFrom + region.nextFrom, contentTo: block.contentTo + region.nextFrom,
                    })));
                    inheritBoxHeights(value.blocks, replacements, transaction.changes);
                    value = patchSourceReveal(value, transaction, fences, replacements, shouldShowSource, projectBlock);
                    value.ranges = value.blocks.map(({ from, to }) => ({ from, to }));
                    if (transaction.effects.length || transaction.state.field(mouseSelectingField, false)
                        || transaction.startState.field(mouseSelectingField, false)) return buildState(transaction.state, value.blocks);
                    return updateSourceReveal(value, transaction, shouldShowSource, projectBlock);
                }
                const mapped = mapState(value, transaction.changes);
                mapped.revealIndex = sourceRevealIndex(mapped.blocks);
                return updateSourceReveal(mapped, transaction, shouldShowSource, projectBlock);
            }

            const isDragging = transaction.state.field(mouseSelectingField, false);
            const wasDragging = transaction.startState.field(mouseSelectingField, false);
            if (wasDragging && !isDragging) return buildState(transaction.state, value.blocks);
            if (isDragging) return value;
            if (foldedRanges(transaction.startState) !== foldedRanges(transaction.state)) {
                return buildState(transaction.state, value.blocks);
            }
            // Selection changes only choose rendered versus revealed source.
            // The immutable document's parsed fences survive navigation, and
            // motion inside the same revealed fence keeps its decorations too.
            return transaction.selection
                ? updateSourceReveal(value, transaction, shouldShowSource, projectBlock)
                : value;
        },
        provide: field => [
            preparedDiagramPreviewExtension,
            diagramLayoutTracker(sizeMemory),
            EditorView.decorations.from(field, value => value.decorations),
            EditorView.updateListener.of(update => {
                if (update.docChanged) pendingViewActivity.get(update.view)?.();
            }),
        ],
    });
}
