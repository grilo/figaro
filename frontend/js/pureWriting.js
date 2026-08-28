import { Decoration, ViewPlugin } from '@codemirror/view';
import { StateEffect, Transaction } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import {
    adaptiveTypographyPlan,
    pureFocusRange,
    shouldRunTypewriterScroll,
    typewriterMotionPlan,
    typewriterScrollTarget,
} from './core/pureWritingModel.js';

export const refreshPureWritingEffect = StateEffect.define();

const BLOCK_WIDGET_SELECTOR = [
    '.cm-block-widget-spacing',
    '.cm-codeblock-widget',
    '.cm-table-widget',
    '.cm-diagram-widget',
].join(', ');

function enclosingMarkdownBlock(state, position) {
    const head = Math.min(Math.max(Number(position) || 0, 0), state.doc.length);
    let node = syntaxTree(state).resolveInner(head, -1);
    const ancestors = [];
    for (; node; node = node.parent) ancestors.push(node);

    const named = matcher => ancestors.find(candidate => matcher(candidate.name));
    const structural = named(name => name === 'ListItem')
        || named(name => /^(?:FencedCode|CodeBlock|Table|Blockquote|HTMLBlock)$/.test(name))
        || named(name => /^(?:Paragraph|ATXHeading[1-6]|SetextHeading[12]|LinkReference)$/.test(name));
    if (structural) return { from: structural.from, to: structural.to };

    const line = state.doc.lineAt(head);
    return { from: line.from, to: line.to };
}

function localePhraseRanges(source, block) {
    const text = source.slice(block.from, block.to);
    if (!text) return [block];

    if (typeof Intl?.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
        return [...segmenter.segment(text)].map(segment => ({
            from: block.from + segment.index,
            to: block.from + segment.index + segment.segment.length,
        }));
    }

    const ranges = [];
    const boundary = /[^.!?…]+(?:[.!?…]+["')\]]*|$)\s*/gu;
    let match;
    while ((match = boundary.exec(text)) !== null) {
        if (!match[0]) break;
        ranges.push({
            from: block.from + match.index,
            to: block.from + match.index + match[0].length,
        });
    }
    return ranges.length ? ranges : [block];
}

function activeFocusRange(view, options) {
    if (!options.isMarkdown() || !options.isPureActive()) return null;
    const scope = options.focusScope();
    const selection = view.state.selection.main;
    if (scope === 'off' || !selection.empty || options.pointerSelecting(view.state)
        || options.searchOpen(view.state)) return null;

    const source = view.state.doc.toString();
    const block = enclosingMarkdownBlock(view.state, selection.head);
    return pureFocusRange({
        source,
        position: selection.head,
        scope,
        blockRange: block,
        phraseRanges: scope === 'phrase' ? localePhraseRanges(source, block) : [],
    });
}

function focusDecorations(view, range) {
    if (!range) return Decoration.none;
    const decorations = [];
    const seenLines = new Set();

    for (const visible of view.visibleRanges) {
        let line = view.state.doc.lineAt(visible.from);
        while (line.from <= visible.to && !seenLines.has(line.number)) {
            seenLines.add(line.number);
            const outside = line.to < range.from || line.from > range.to;
            if (outside) {
                decorations.push(Decoration.line({ class: 'cm-pure-focus-dimmed' }).range(line.from));
            } else {
                if (line.from < range.from) {
                    decorations.push(Decoration.mark({ class: 'cm-pure-focus-dimmed' })
                        .range(line.from, Math.min(line.to, range.from)));
                }
                if (line.to > range.to) {
                    decorations.push(Decoration.mark({ class: 'cm-pure-focus-dimmed' })
                        .range(Math.max(line.from, range.to), line.to));
                }
            }
            if (line.to >= view.state.doc.length) break;
            line = view.state.doc.line(line.number + 1);
        }
    }

    return Decoration.set(decorations, true);
}

function syncBlockWidgetFocus(view, range) {
    const nodes = [...view.contentDOM.querySelectorAll(BLOCK_WIDGET_SELECTOR)]
        .filter(node => !node.parentElement?.closest?.(BLOCK_WIDGET_SELECTOR));
    for (const node of nodes) {
        let position = null;
        try { position = view.posAtDOM(node); } catch (_) { /* detached or synthetic widget */ }
        const dimmed = Boolean(range && Number.isInteger(position)
            && (position < range.from || position > range.to));
        node.classList.toggle('cm-pure-focus-dimmed', dimmed);
    }
}

function updateViewPresentation(view, options, previousTier = 'regular') {
    const pureActive = options.isPureActive() && options.isMarkdown();
    const typewriter = pureActive && options.typewriterEnabled();
    const selection = view.state.selection.main;
    view.dom.classList.toggle('cm-pure-writing', pureActive);
    view.dom.classList.toggle('cm-pure-typewriter', typewriter);
    view.dom.classList.toggle('cm-pure-caret-at-start', pureActive
        && selection.empty && view.state.doc.lineAt(selection.head).number === 1);

    const scrollerHeight = Math.max(0, view.scrollDOM.clientHeight || 0);
    const lineHeight = Math.max(1, view.defaultLineHeight || 1);
    const topSpace = typewriter ? Math.max(0, scrollerHeight * 0.42 - lineHeight / 2) : 0;
    const bottomSpace = typewriter ? Math.max(40, scrollerHeight * 0.58 - lineHeight / 2) : 40;
    view.dom.style.setProperty('--pure-typewriter-top-space', `${topSpace}px`);
    view.dom.style.setProperty('--pure-typewriter-bottom-space', `${bottomSpace}px`);

    const typography = adaptiveTypographyPlan({
        pureActive,
        enabled: options.adaptiveTypographyEnabled(),
        viewportWidth: view.scrollDOM.clientWidth,
        previousTier,
    });
    view.dom.dataset.pureTypographyTier = typography.tier;
    view.dom.style.setProperty('--pure-adaptive-scale', String(typography.scale));
    if (pureActive && options.adaptiveTypographyEnabled()) {
        const rootStyle = view.dom.ownerDocument?.defaultView
            ?.getComputedStyle?.(view.dom.ownerDocument.documentElement);
        const baseFontSize = Number.parseFloat(rootStyle?.getPropertyValue('--font-size-editor'));
        const baseWidth = Number.parseFloat(rootStyle?.getPropertyValue('--editor-width'));
        if (Number.isFinite(baseFontSize)) {
            view.dom.style.setProperty(
                '--editor-active-font-size', `${baseFontSize * typography.scale}px`,
            );
        }
        if (Number.isFinite(baseWidth)) {
            view.dom.style.setProperty(
                '--editor-active-width', `${baseWidth * typography.scale}px`,
            );
        }
    } else {
        view.dom.style.removeProperty('--editor-active-font-size');
        view.dom.style.removeProperty('--editor-active-width');
    }
    return typography.tier;
}

function userEvents(update) {
    return update.transactions
        .map(transaction => transaction.annotation(Transaction.userEvent))
        .filter(Boolean);
}

function reducedMotionRequested(view) {
    return Boolean(view.dom.ownerDocument?.defaultView
        ?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function easeOrganic(progress) {
    const remaining = 1 - progress;
    return 1 - remaining * remaining * remaining;
}

export function createPureWritingExtension(options = {}) {
    const resolved = {
        isPureActive: options.isPureActive || (() => false),
        isMarkdown: options.isMarkdown || (() => true),
        typewriterEnabled: options.typewriterEnabled || (() => true),
        focusScope: options.focusScope || (() => 'off'),
        adaptiveTypographyEnabled: options.adaptiveTypographyEnabled || (() => false),
        pointerSelecting: options.pointerSelecting || (() => false),
        searchOpen: options.searchOpen || (() => false),
    };
    const measureKey = {};

    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.view = view;
            this.frame = 0;
            this.typographyTier = updateViewPresentation(view, resolved);
            this.focusRange = activeFocusRange(view, resolved);
            this.decorations = focusDecorations(view, this.focusRange);
            this.resizeObserver = typeof ResizeObserver === 'function'
                ? new ResizeObserver(() => this.syncGeometry())
                : null;
            this.resizeObserver?.observe(view.scrollDOM);
            this.cancelFromUserGesture = () => this.cancelMotion();
            view.scrollDOM.addEventListener('wheel', this.cancelFromUserGesture, { passive: true });
            view.contentDOM.addEventListener('pointerdown', this.cancelFromUserGesture, { passive: true });
            queueMicrotask(() => syncBlockWidgetFocus(view, this.focusRange));
        }

        update(update) {
            const refreshed = update.transactions.some(transaction => transaction.effects
                .some(effect => effect.is(refreshPureWritingEffect)));
            if (update.docChanged || update.selectionSet || update.viewportChanged
                || update.geometryChanged || refreshed) {
                this.typographyTier = updateViewPresentation(
                    update.view, resolved, this.typographyTier,
                );
                this.focusRange = activeFocusRange(update.view, resolved);
                this.decorations = focusDecorations(update.view, this.focusRange);
                queueMicrotask(() => {
                    if (!update.view.isDestroyed) syncBlockWidgetFocus(update.view, this.focusRange);
                });
            }

            if (!resolved.isPureActive() || !resolved.typewriterEnabled()) this.cancelMotion();
            if (shouldRunTypewriterScroll({
                pureActive: resolved.isPureActive() && resolved.isMarkdown(),
                enabled: resolved.typewriterEnabled(),
                docChanged: update.docChanged,
                selectionEmpty: update.state.selection.main.empty,
                pointerSelecting: resolved.pointerSelecting(update.state),
                searchOpen: resolved.searchOpen(update.state),
                userEvents: userEvents(update),
            })) this.scheduleTypewriterMeasure(update.view);
        }

        syncGeometry() {
            if (this.view.isDestroyed) return;
            const nextTier = updateViewPresentation(this.view, resolved, this.typographyTier);
            if (nextTier !== this.typographyTier) this.view.requestMeasure();
            this.typographyTier = nextTier;
        }

        scheduleTypewriterMeasure(view) {
            this.cancelMotion();
            view.requestMeasure({
                key: measureKey,
                read(measuredView) {
                    const caret = measuredView.coordsAtPos(measuredView.state.selection.main.head);
                    const viewport = measuredView.scrollDOM.getBoundingClientRect();
                    if (!caret || !viewport.height) return null;
                    return typewriterScrollTarget({
                        scrollTop: measuredView.scrollDOM.scrollTop,
                        scrollHeight: measuredView.scrollDOM.scrollHeight,
                        clientHeight: measuredView.scrollDOM.clientHeight,
                        caretTop: caret.top,
                        viewportTop: viewport.top,
                    });
                },
                write: target => {
                    if (target === null || view.isDestroyed || !resolved.isPureActive()) return;
                    this.animateTo(target);
                },
            });
        }

        animateTo(target) {
            const scroller = this.view.scrollDOM;
            const plan = typewriterMotionPlan({
                from: scroller.scrollTop,
                to: target,
                reducedMotion: reducedMotionRequested(this.view),
            });
            if (!plan.duration || typeof requestAnimationFrame !== 'function') {
                scroller.scrollTop = plan.to;
                return;
            }

            let startedAt = null;
            const step = timestamp => {
                if (startedAt === null) startedAt = timestamp;
                const progress = Math.min(1, (timestamp - startedAt) / plan.duration);
                scroller.scrollTop = plan.from + (plan.to - plan.from) * easeOrganic(progress);
                if (progress < 1) this.frame = requestAnimationFrame(step);
                else this.frame = 0;
            };
            this.frame = requestAnimationFrame(step);
        }

        cancelMotion() {
            if (!this.frame || typeof cancelAnimationFrame !== 'function') return;
            cancelAnimationFrame(this.frame);
            this.frame = 0;
        }

        destroy() {
            this.cancelMotion();
            this.resizeObserver?.disconnect();
            this.view.scrollDOM.removeEventListener('wheel', this.cancelFromUserGesture);
            this.view.contentDOM.removeEventListener('pointerdown', this.cancelFromUserGesture);
            syncBlockWidgetFocus(this.view, null);
        }
    }, { decorations: value => value.decorations });
}

export function refreshPureWriting(view) {
    if (!view || view.isDestroyed) return false;
    view.dispatch({ effects: refreshPureWritingEffect.of(null) });
    return true;
}
