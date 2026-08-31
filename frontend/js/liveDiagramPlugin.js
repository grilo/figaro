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
import { diagramLanguages, renderDiagramSVG } from './diagramRenderer.js';
import { wrapBlockWidget } from './blockWidget.js';
import { fitGraphicToSourceFootprint, markSourceFootprint } from './sourceFootprint.js';
import { createDiagramRenderQueue } from './usecases/diagramRenderQueue.js';
import {
    setVegaLiteChartHeight,
    vegaLiteChartHeight,
    vegaLiteChartResizePlan,
} from './core/vegaLiteChartEditorModel.js';

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
    const diagrams = [];
    let open = null;

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
const DIAGRAM_SCROLL_QUIET_PERIOD = 50;

function scheduleDiagramIdle(callback, view) {
    const win = view?.dom?.ownerDocument?.defaultView || globalThis;
    if (!view?.scrollDOM) {
        const handle = win.setTimeout(callback, 0);
        return { cancel: () => win.clearTimeout(handle) };
    }

    let cancelled = false;
    let timer = null;
    let idleHandle = null;
    let lastScrollTop = view.scrollDOM.scrollTop;
    let scrollListener = null;

    const clearSchedule = () => {
        if (timer !== null) {
            win.clearTimeout(timer);
            timer = null;
        }
        if (idleHandle !== null) {
            win.cancelIdleCallback?.(idleHandle);
            idleHandle = null;
        }
        if (scrollListener) {
            view.scrollDOM.removeEventListener('scroll', scrollListener);
            scrollListener = null;
        }
    };

    const run = () => {
        if (cancelled) return;
        clearSchedule();
        callback();
    };

    const runWhenQuiet = () => {
        if (cancelled) return;
        timer = null;
        const currentScrollTop = view.scrollDOM.scrollTop;
        if (currentScrollTop !== lastScrollTop) {
            lastScrollTop = currentScrollTop;
            timer = win.setTimeout(runWhenQuiet, DIAGRAM_SCROLL_QUIET_PERIOD);
            return;
        }

        if (typeof win.requestIdleCallback === 'function') {
            idleHandle = win.requestIdleCallback(run, { timeout: DIAGRAM_IDLE_TIMEOUT });
        } else {
            timer = win.setTimeout(run, DIAGRAM_SCROLL_QUIET_PERIOD);
        }
    };

    scrollListener = () => {
        if (cancelled) return;
        lastScrollTop = view.scrollDOM.scrollTop;
        if (idleHandle !== null) {
            win.cancelIdleCallback?.(idleHandle);
            idleHandle = null;
        }
        if (timer !== null) win.clearTimeout(timer);
        timer = win.setTimeout(runWhenQuiet, DIAGRAM_SCROLL_QUIET_PERIOD);
    };
    view.scrollDOM.addEventListener('scroll', scrollListener, { passive: true });
    timer = win.setTimeout(runWhenQuiet, DIAGRAM_SCROLL_QUIET_PERIOD);
    return {
        cancel() {
            if (cancelled) return;
            cancelled = true;
            clearSchedule();
        },
    };
}

function createDiagramWidget(WidgetType, renderQueue) {
    return class DiagramWidget extends WidgetType {
        constructor(
            lang,
            code,
            recoveredFence = false,
            sourceLines = 1,
            sourceText = '',
            from = 0,
            to = 0,
        ) {
            super();
            this.lang = lang;
            this.code = code;
            this.recoveredFence = recoveredFence;
            this.sourceLines = sourceLines;
            this.sourceText = sourceText;
            this.from = from;
            this.to = to;
            this.chartHeight = lang === 'vega-lite' ? vegaLiteChartHeight(code) : null;
            this.destroyed = false;
            this.renderVersion = 0;
            this.renderTask = null;
            this.stopGraphicFit = null;
        }

        eq(other) {
            return other instanceof DiagramWidget &&
                other.lang === this.lang &&
                other.code === this.code &&
                other.recoveredFence === this.recoveredFence &&
                other.sourceLines === this.sourceLines &&
                other.sourceText === this.sourceText &&
                other.chartHeight === this.chartHeight;
        }

        currentBlock(view, root) {
            let position = this.from;
            try {
                const mapped = view.posAtDOM(root, 0);
                if (Number.isInteger(mapped)) position = mapped;
            } catch (_) { /* a detached widget cannot commit a resize */ }
            return scanDiagramFences(view.state.doc).find(block => (
                block.lang === 'vega-lite'
                && block.from <= position
                && block.to >= position
            )) || scanDiagramFences(view.state.doc).find(block => (
                block.lang === 'vega-lite' && block.from === this.from
            )) || null;
        }

        applyChartHeight(root, height) {
            const normalized = vegaLiteChartResizePlan({ startHeight: height, deltaY: 0 });
            root.dataset.figaroChartHeight = String(normalized);
            root.style.setProperty('--cm-source-footprint-height', `${normalized + 44}px`);
            root.querySelector('.cm-vega-lite-chart-resize-readout').textContent = `${normalized}px high`;
            return normalized;
        }

        createChartResizeHandle(view, root) {
            const handle = document.createElement('button');
            handle.type = 'button';
            handle.className = 'ui-image-resize-handle cm-vega-lite-chart-resize-handle';
            handle.dataset.uiTooltip = 'Resize chart vertically';
            handle.setAttribute('aria-label', 'Resize chart vertically');
            const readout = document.createElement('output');
            readout.className = 'cm-vega-lite-chart-resize-readout';
            readout.setAttribute('aria-live', 'polite');
            readout.textContent = `${this.chartHeight}px high`;
            handle.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                const start = { y: event.clientY, height: this.chartHeight };
                let currentHeight = start.height;
                const tooltip = handle.dataset.uiTooltip;
                handle.removeAttribute('data-ui-tooltip');
                root.classList.add('is-resizing');
                view.dom.classList.add('cm-vega-lite-chart-resizing');
                handle.setPointerCapture?.(event.pointerId);

                const move = moveEvent => {
                    currentHeight = vegaLiteChartResizePlan({
                        startHeight: start.height,
                        deltaY: moveEvent.clientY - start.y,
                    });
                    this.applyChartHeight(root, currentHeight);
                };
                const finish = endEvent => {
                    root.classList.remove('is-resizing');
                    view.dom.classList.remove('cm-vega-lite-chart-resizing');
                    const changed = currentHeight !== start.height;
                    if (endEvent.type === 'pointerup' && changed) {
                        const block = this.currentBlock(view, root);
                        const source = block ? (block.rawCode ?? block.code) : '';
                        const replacement = setVegaLiteChartHeight(source, currentHeight);
                        if (block && replacement && replacement !== source) {
                            view.dispatch({
                                changes: { from: block.contentFrom, to: block.contentTo, insert: `${replacement}${view.state.lineBreak}` },
                                annotations: Transaction.userEvent.of('chart.resize'),
                            });
                        } else {
                            this.applyChartHeight(root, start.height);
                        }
                    } else {
                        this.applyChartHeight(root, start.height);
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
            root.append(handle, readout);
        }

        toDOM(view) {
            this.destroyed = false;
            this.renderVersion += 1;
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
            setMessage(content, 'cm-live-diagram-loading', 'Rendering ' + this.lang + '…');

            dom.append(label, content);
            const wrapper = wrapBlockWidget(dom, 'cm-block-widget--diagram');
            if (this.lang === 'mermaid') wrapper.classList.add('cm-block-widget--mermaid');
            markSourceFootprint(wrapper, {
                kind: this.lang,
                lineCount: this.sourceLines,
                lineHeight: view?.defaultLineHeight,
                sourceText: this.sourceText,
            });
            if (this.chartHeight) {
                wrapper.classList.add('cm-block-widget--figaro-chart');
                this.createChartResizeHandle(view, wrapper);
                this.applyChartHeight(wrapper, this.chartHeight);
            }
            this.renderTask = renderQueue.enqueue(
                () => this.renderInto(content, wrapper),
                view,
            );
            return wrapper;
        }

        async renderInto(container, root) {
            const version = ++this.renderVersion;

            try {
                const svg = await renderDiagramSVG(this.lang, this.code, 'figaro-live-diagram', {
                    appearance: this.chartHeight ? 'application' : 'authored',
                    containerWidth: container.clientWidth || root.clientWidth,
                });
                if (this.destroyed || version !== this.renderVersion) return;

                if (typeof svg !== 'string' || !svg) {
                    setMessage(container, 'cm-live-diagram-error', 'Diagram renderer is unavailable');
                    root.dataset.sourceFootprintState = 'underflow';
                    return;
                }

                container.innerHTML = svg;
                const graphic = container.querySelector('svg');
                if (graphic) {
                    graphic.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                    this.stopGraphicFit?.();
                    this.stopGraphicFit = fitGraphicToSourceFootprint(root, container, graphic);
                }
            } catch (error) {
                if (this.destroyed || version !== this.renderVersion) return;
                log.warn('[diagram] ' + this.lang + ' render error: ' + (error.message || error));
                setMessage(container, 'cm-live-diagram-error', 'Unable to render ' + this.lang + ' diagram');
                root.dataset.sourceFootprintState = 'underflow';
            }
        }

        // Let a click on the preview move the cursor back into the source.
        ignoreEvent(event) {
            return Boolean(event?.target?.closest?.('.cm-vega-lite-chart-resize-handle'));
        }

        destroy() {
            this.destroyed = true;
            this.renderVersion++;
            this.renderTask?.cancel?.();
            this.stopGraphicFit?.();
        }
    };
}

/** Build the live-preview state field for diagram block decorations. */
export function createDiagramField(StateField, EditorView, Decoration, WidgetType, shouldShowSource, mouseSelectingField) {
    const renderQueue = createDiagramRenderQueue({
        schedule: scheduleDiagramIdle,
        cancel: handle => handle?.cancel?.(),
        onError: error => log.warn('[diagram] queued render error: ' + (error.message || error)),
    });
    const DiagramWidget = createDiagramWidget(WidgetType, renderQueue);

    const sourceRangeIsFolded = (state, block) => {
        const foldFrom = state.doc.lineAt(block.from).to;
        let found = false;
        foldedRanges(state).between(foldFrom, block.to, (from, to) => {
            if (from === foldFrom && to === block.to) found = true;
        });
        return found;
    };

    const buildState = (state) => {
        const decorations = [];
        const ranges = [];
        const isDragging = state.field(mouseSelectingField, false);
        const blocks = scanDiagramFences(state.doc);

        for (const block of blocks) {
            ranges.push({ from: block.from, to: block.to });
            const sourceVisible = shouldShowSource(state, block.from, block.to);
            const folded = sourceRangeIsFolded(state, block);
            if (!block.code || isDragging || sourceVisible || folded) {
                const height = block.lang === 'vega-lite' && sourceVisible && !folded
                    ? vegaLiteChartHeight(block.rawCode ?? block.code)
                    : null;
                if (height) {
                    const firstLine = state.doc.lineAt(block.from).number;
                    const lastLine = state.doc.lineAt(block.to).number;
                    for (let number = firstLine; number <= lastLine; number += 1) {
                        const opener = number === firstLine;
                        decorations.push(Decoration.line({
                            class: opener
                                ? 'cm-vega-lite-chart-source-line cm-vega-lite-chart-source-placeholder'
                                : 'cm-vega-lite-chart-source-line',
                            attributes: opener ? {
                                style: `--cm-vega-lite-chart-source-height:calc(${height + 44}px - ${lastLine - firstLine}lh)`,
                            } : undefined,
                        }).range(state.doc.line(number).from));
                    }
                }
                continue;
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
                ),
                block: true,
            }).range(block.from, block.to));
        }

        return {
            decorations: decorations.length
                ? Decoration.set(decorations.sort((a, b) => a.from - b.from), true)
                : Decoration.none,
            ranges,
            blocks,
        };
    };

    const selectionTouchesRanges = (selection, ranges) => selection?.ranges?.some(selectionRange =>
        ranges.some(range => selectionRange.from <= range.to && selectionRange.to >= range.from)
    );

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
        decorations: value.decorations.map(changes),
        ranges: value.ranges.map(range => ({
            from: changes.mapPos(range.from, -1),
            to: changes.mapPos(range.to, 1),
        })),
        blocks: value.blocks.map(block => ({
            ...block,
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
            if (transaction.docChanged || transaction.reconfigured) {
                if (transaction.reconfigured || changesNeedDiagramRescan(value, transaction)) {
                    return buildState(transaction.state);
                }
                return mapState(value, transaction.changes);
            }

            const isDragging = transaction.state.field(mouseSelectingField, false);
            const wasDragging = transaction.startState.field(mouseSelectingField, false);
            if (wasDragging && !isDragging) return buildState(transaction.state);
            if (isDragging) return value;
            if (foldedRanges(transaction.startState) !== foldedRanges(transaction.state)) {
                return buildState(transaction.state);
            }
            if (transaction.selection && (
                selectionTouchesRanges(transaction.startState.selection, value.ranges)
                || selectionTouchesRanges(transaction.state.selection, value.ranges)
            )) return buildState(transaction.state);
            return value;
        },
        provide: field => EditorView.decorations.from(field, value => value.decorations),
    });
}
