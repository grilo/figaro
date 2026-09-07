import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, ViewPlugin, activateHover, closeHoverTooltip, hoverTooltip, keymap, tooltips } from '@codemirror/view';
import { inlineWritingFindings, writingFindingsAt, visibleWritingRanges, writingTooltipBounds } from './core/writingInlineModel.js';
import { createWritingInlineView } from './views/writingInlineView.js';
import { createWritingLinkHints } from './writingLinkHints.js';

export const setInlineWriting = StateEffect.define();
/** Adapt CodeMirror coordinates to plain source-change data for review anchors. */
export function writingChangedRanges(changes) {
    const ranges = [];
    changes.iterChangedRanges((from, to, nextFrom, nextTo) => ranges.push({ from, to, insertedLength: nextTo - nextFrom }));
    return ranges;
}
const empty = () => ({ findings: [], actions: {} });
export const inlineWritingState = StateField.define({
    create: empty,
    update(value, transaction) {
        // Never map an actionable suggestion onto changed text, even briefly.
        if (transaction.docChanged) value = empty();
        for (const effect of transaction.effects) if (effect.is(setInlineWriting)) {
            const { snapshot, actions } = effect.value;
            const findings = inlineWritingFindings(snapshot);
            value = { findings, actions };
        }
        return value;
    },
});

function visibleMarks(view) {
    return Decoration.set(visibleWritingRanges(view.state.field(inlineWritingState).findings, view.visibleRanges)
        .map(({ finding, from, to }) => Decoration.mark({
            class: 'cm-lintRange cm-writing-range', attributes: { 'data-writing-id': finding.id },
        }).range(from, to)), true);
}
const writingMarks = ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = visibleMarks(view); }
    update(update) {
        if (update.viewportChanged || update.startState.field(inlineWritingState) !== update.state.field(inlineWritingState)) {
            this.decorations = visibleMarks(update.view);
        }
    }
}, { decorations: plugin => plugin.decorations });

const writingLinkHints = createWritingLinkHints(state => state.field(inlineWritingState).findings);
const writingHover = hoverTooltip((view, position, side) => {
    const state = view.state.field(inlineWritingState);
    const link = view.plugin(writingLinkHints)?.at(position, state.findings);
    const findings = link?.findings || writingFindingsAt(state.findings, position, side);
    if (!findings.length) return null;
    return { pos: link?.from ?? Math.min(...findings.map(item => item.from)), end: link?.to ?? Math.max(...findings.map(item => item.to)), above: false,
        create() {
            const close = () => { view.dispatch({ effects: closeHoverTooltip(writingHover) }); view.focus(); };
            const sourceDoc = view.state.doc;
            const closeIfCurrent = () => { if (view.dom.isConnected && view.state.doc === sourceDoc && (dom.contains(document.activeElement) || document.activeElement === document.body || view.hasFocus)) close(); };
            const dom = createWritingInlineView({ findings,
                onApply: (id, index) => { state.actions.apply?.(id, index); close(); },
                onApplyAll: state.actions.applyAll ? id => { state.actions.applyAll(id); close(); } : undefined,
                bulkCount: state.actions.bulkCount,
                onIgnore: async id => { await state.actions.ignore?.(id); closeIfCurrent(); },
                onAcceptAcronym: state.actions.acceptAcronym ? async id => { await state.actions.acceptAcronym(id); closeIfCurrent(); } : undefined,
                onAddWord: state.actions.addWord ? async finding => {
                    const sourceDoc = view.state.doc;
                    const hadFocus = dom.contains(document.activeElement);
                    await state.actions.addWord(finding);
                    if (view.dom.isConnected && view.state.doc === sourceDoc && (hadFocus || document.activeElement === document.body)) close();
                } : undefined,
                onClose: close,
            });
            if (link) {
                const info = document.createElement('p'); info.className = 'writing-lenses-description';
                info.textContent = `Link: ${link.info && link.info !== link.destination ? link.info + ' — ' : ''}${link.destination}. Ctrl/Cmd-click the link to open it.`;
                dom.append(info);
            }
            return { dom };
        },
    };
}, { hoverTime: 300, hideOn: transaction => transaction.docChanged || transaction.selection != null
    || transaction.effects.some(effect => effect.is(setInlineWriting)) });

export function openInlineWriting(view) {
    const { findings } = view.state.field(inlineWritingState, false) || empty();
    const position = view.state.selection.main.head;
    const found = writingFindingsAt(findings, position)[0];
    // Consume the review shortcut while checks refresh instead of invoking GTK's emoji picker.
    if (!found) return Boolean(view.state.field(inlineWritingState, false));
    activateHover(view, Math.max(found.from, Math.min(position, found.to - 1)), 1, { tooltip: writingHover });
    view.requestMeasure({ read: () => null, write: () => view.dom.querySelector('.cm-writing-tooltip button')?.focus() });
    return true;
}

export const writingInlineExtension = [inlineWritingState, writingMarks, writingLinkHints, writingHover,
    tooltips({ tooltipSpace: view => {
        const viewport = view.dom.ownerDocument.defaultView;
        if (!view.dom.querySelector('.cm-writing-tooltip')) return { left: 0, top: 0, right: viewport.innerWidth, bottom: viewport.innerHeight };
        return writingTooltipBounds(view.dom.getBoundingClientRect(), { width: viewport.innerWidth, height: viewport.innerHeight });
    } }),
    keymap.of([{ key: 'Mod-.', run: openInlineWriting }, { key: 'Escape', run: view => {
        if (!view.dom.querySelector('.cm-writing-tooltip')) return false;
        view.dispatch({ effects: closeHoverTooltip(writingHover) }); return true;
    } }]),
];

export function updateInlineWriting(view, snapshot, actions) {
    if (!view) return;
    const effects = [setInlineWriting.of({ snapshot, actions })];
    if (!view.state.field(inlineWritingState, false)) effects.unshift(StateEffect.appendConfig.of(writingInlineExtension));
    view.dispatch({ effects });
}
