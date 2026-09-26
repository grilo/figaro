import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, activateHover, closeHoverTooltip, hoverTooltip, keymap, tooltips } from '@codemirror/view';
import { inlineWritingFindings, writingFindingsAt, writingTooltipBounds } from './core/writingInlineModel.js';
import { createWritingInlineView } from './views/writingInlineView.js';
import { writingFindingTier } from './core/writingReviewModel.js';
import { createWritingLinkHints } from './writingLinkHints.js';
import { writingFindingDependsOnDocument, writingEditChangesStructure } from './core/writingRetentionModel.js';

import { countEditorWork } from './editorDiagnostics.js';

export const setInlineWriting = StateEffect.define();
/** Adapt CodeMirror coordinates to plain source-change data for review anchors. */
export function writingChangedRanges(changes) {
    const ranges = [];
    changes.iterChangedRanges((from, to, nextFrom, nextTo) => ranges.push({ from, to, insertedLength: nextTo - nextFrom }));
    return ranges;
}
function findingsInRange(decorations, from, to) {
    const findings = [];
    decorations.between(from, to, (start, end, value) => {
        countEditorWork('writing.inlineRanges');
        const finding = value.spec.finding;
        findings.push(start === finding.from && end === finding.to ? finding : { ...finding, from: start, to: end });
    });
    return findings;
}

function inlineState(decorations = Decoration.none, local = Decoration.none, actions = {}, stale = false) {
    let findings;
    return { decorations, local, actions, ...(stale ? { stale } : {}),
        // Snapshot/debug callers may enumerate. Editing and hover query the range tree.
        get findings() { return findings ??= findingsInRange(decorations, 0, Number.MAX_SAFE_INTEGER); } };
}
const empty = () => inlineState();

// Read only edited paragraphs from CodeMirror's immutable Text. A keystroke
// must not serialize or parse the whole note to retain unrelated underlines.
function editedParagraph(doc, from, to) {
    let first = doc.lineAt(from), last = doc.lineAt(to);
    while (first.number > 1 && doc.line(first.number - 1).text.trim()) first = doc.line(first.number - 1);
    while (last.number < doc.lines && doc.line(last.number + 1).text.trim()) last = doc.line(last.number + 1);
    return { from: first.from, to: last.to };
}

function retainedInlineState(value, transaction) {
    if (!value.decorations.size) return empty();
    const paragraphs = [];
    let structural = false;
    transaction.changes.iterChanges((from, to, nextFrom, nextTo, inserted) => {
        const before = transaction.startState.doc, after = transaction.newDoc;
        paragraphs.push(editedParagraph(before, from, to));
        structural ||= writingEditChangesStructure({ removed: before.sliceString(from, to), inserted: inserted.toString(),
            beforeLine: before.sliceString(before.lineAt(from).from, before.lineAt(to).to),
            afterLine: after.sliceString(after.lineAt(nextFrom).from, after.lineAt(nextTo).to) });
    });
    if (structural) return inlineState(Decoration.none, Decoration.none, {}, true);
    let decorations = value.local;
    for (const paragraph of paragraphs) {
        decorations = decorations.update({ filterFrom: paragraph.from, filterTo: paragraph.to,
            filter: (from, to) => { countEditorWork('writing.inlineInvalidation'); return from > paragraph.to || to < paragraph.from; } });
    }
    decorations = decorations.map(transaction.changes);
    return inlineState(decorations, decorations, {}, true);
}
export const inlineWritingState = StateField.define({
    create: empty,
    update(value, transaction) {
        if (transaction.docChanged) value = retainedInlineState(value, transaction);
        for (const effect of transaction.effects) if (effect.is(setInlineWriting)) {
            const { snapshot, actions } = effect.value;
            // Status publications must not erase the mapped display-only marks.
            if (snapshot?.stale) continue;
            const findings = inlineWritingFindings(snapshot);
            const ranges = findings.map(finding => Decoration.mark({ finding,
                class: `cm-lintRange cm-writing-range cm-writing-range--${writingFindingTier(finding)}`,
                attributes: { 'data-writing-id': finding.id },
            }).range(finding.from, finding.to));
            value = inlineState(Decoration.set(ranges, true),
                Decoration.set(ranges.filter(range => !writingFindingDependsOnDocument(range.value.spec.finding)), true), actions);
        }
        return value;
    },
    provide: field => EditorView.decorations.from(field, value => value.decorations),
});

const writingLinkHints = createWritingLinkHints(state => state.field(inlineWritingState).decorations, findingsInRange);
const writingHover = hoverTooltip((view, position, side) => {
    const state = view.state.field(inlineWritingState);
    const link = view.plugin(writingLinkHints)?.at(position, state.decorations);
    const findings = link?.findings || writingFindingsAt(findingsInRange(state.decorations, position, position), position, side);
    if (!findings.length) return null;
    return { pos: link?.from ?? Math.min(...findings.map(item => item.from)), end: link?.to ?? Math.max(...findings.map(item => item.to)), above: false,
        create() {
            const close = () => { view.dispatch({ effects: closeHoverTooltip(writingHover) }); view.focus(); };
            const sourceDoc = view.state.doc;
            const closeIfCurrent = () => { if (view.dom.isConnected && view.state.doc === sourceDoc && (dom.contains(document.activeElement) || document.activeElement === document.body || view.hasFocus)) close(); };
            const dom = createWritingInlineView({ findings,
                stale: Boolean(state.stale),
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
    const { decorations } = view.state.field(inlineWritingState, false) || empty();
    const position = view.state.selection.main.head;
    const found = writingFindingsAt(findingsInRange(decorations, position, position), position)[0];
    // Consume the review shortcut while checks refresh instead of invoking GTK's emoji picker.
    if (!found) return Boolean(view.state.field(inlineWritingState, false));
    activateHover(view, Math.max(found.from, Math.min(position, found.to - 1)), 1, { tooltip: writingHover });
    view.requestMeasure({ read: () => null, write: () => view.dom.querySelector('.cm-writing-tooltip button')?.focus() });
    return true;
}

export const writingInlineExtension = [inlineWritingState, writingLinkHints, writingHover,
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
