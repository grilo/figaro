import { Annotation, EditorState, Transaction, RangeSet, RangeSetBuilder, RangeValue, StateEffect, StateField } from '@codemirror/state';
import { Decoration, GutterMarker, ViewPlugin, gutter } from '@codemirror/view';
import { foldedRanges } from '@codemirror/language';
import { activityDateKey, applyProvisionalActivityDate, formatActivityMarginDate, groupActivityPassages } from './core/activityModel.js';
import { synchronizeEditorBlockActionLayout } from './editorBlockActionLayout.js';

export const setActivityData = StateEffect.define();
export const activityEditDate = Annotation.define();

/** The editor adapter distinguishes user edits from document mounts and supplies local time. */
export function activityEditDateExtension({
    isDocumentReplacement = () => false,
    dateForTime = time => activityDateKey(time / 1000, Intl.DateTimeFormat().resolvedOptions().timeZone),
} = {}) {
    return EditorState.transactionExtender.of(transaction => transaction.docChanged && !isDocumentReplacement()
        ? { annotations: activityEditDate.of(dateForTime(transaction.annotation(Transaction.time))) } : null);
}
let openActivity = () => {};
export function configureActivityGutter({ open }) { openActivity = open; }

class PassageRange extends RangeValue {
    constructor(data) { super(); this.data = data; this.startSide = 1; this.endSide = -1; }
}
function passageRanges(passages) {
    const builder = new RangeSetBuilder();
    for (const passage of passages) if (passage.to > passage.from) builder.add(passage.from, passage.to, new PassageRange(passage));
    return builder.finish();
}
function reconciledPassageRanges(passages, previous) {
    return passageRanges(passages.map(passage => {
        if (passage.status === 'recorded') return passage;
        let editDate = '';
        previous.between(passage.from, passage.to, (from, to, value) => {
            if (from < passage.to && to > passage.from && value.data.provisional && value.data.date > editDate) editDate = value.data.date;
        });
        return applyProvisionalActivityDate(passage, editDate);
    }));
}

export const activityState = StateField.define({
    create: () => ({ enabled: false, status: 'idle', ranges: RangeSet.empty, events: [], partial: false }),
    update(value, transaction) {
        let next = value;
        if (transaction.docChanged) {
            const editDate = transaction.annotation(activityEditDate);
            const ranges = value.ranges.map(transaction.changes), invalid = new Set(), additions = [];
            transaction.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                let touched = false;
                value.ranges.between(fromA, toA, (from, to, range) => {
                    if (fromA !== toA && (to <= fromA || from >= toA)) return;
                    if (fromA === toA && ((fromA === from && inserted.toString().endsWith('\n')) || (fromA === to && inserted.toString().startsWith('\n')))) return;
                    touched = true; if (invalid.has(range)) return; invalid.add(range);
                    const start = transaction.changes.mapPos(from, 1), end = transaction.changes.mapPos(to, -1);
                    if (end > start) additions.push(new PassageRange(applyProvisionalActivityDate({ ...range.data, status: 'unrecorded', date: '', provisional: false }, editDate)).range(start, end));
                });
                if (!touched && toB > fromB) additions.push(new PassageRange(applyProvisionalActivityDate({ status: 'unrecorded', date: '', events: [], title: 'Unrecorded changes' }, editDate)).range(fromB, toB));
            });
            // RangeSet.map remaps untouched passages without scanning their text.
            const mappedScope = value.scope ? { from: transaction.changes.mapPos(value.scope.from, 1), to: transaction.changes.mapPos(value.scope.to, -1) } : null;
            next = { ...value, scope: mappedScope && mappedScope.to > mappedScope.from ? mappedScope : null, ranges: ranges.update({ ...(invalid.size ? { filter: (_from, _to, range) => !invalid.has(range), filterFrom: Math.min(...additions.map(r => r.from), transaction.newDoc.length), filterTo: Math.max(...additions.map(r => r.to), 0) } : {}), add: additions, sort: true }) };
        }
        for (const effect of transaction.effects) if (effect.is(setActivityData)) {
            const payload = effect.value;
            next = payload.clear ? { ...next, ranges: RangeSet.empty, events: [], scope: null, status: 'idle', partial: false } : next;
            if (typeof payload.enabled === 'boolean') next = { ...next, enabled: payload.enabled };
            if ('scope' in payload) next = { ...next, scope: payload.scope };
            if (payload.status) next = { ...next, status: payload.status, error: payload.error || '' };
            if (payload.projection) next = { ...next, ranges: reconciledPassageRanges(payload.projection.passages, next.ranges), events: payload.projection.events, partial: payload.projection.partial };
        }
        return next;
    },
});

export function currentActivityPassages(view, from = 0, to = view.state.doc.length) {
    const data = view.state.field(activityState, false), passages = [];
    data?.ranges.between(from, to, (start, end, value) => passages.push({ ...value.data, from: start, to: end }));
    return passages;
}
export function activityGroupAt(view, position) {
    return groupActivityPassages(currentActivityPassages(view)).find(group => group.from <= position && group.to >= position);
}
class ActivityMarker extends GutterMarker {
    constructor(group) { super(); this.group = group; }
    eq(other) { return this.group.key === other.group.key && this.group.status === other.group.status && this.group.from === other.group.from && this.group.selected === other.group.selected && this.group.provisional === other.group.provisional; }
    toDOM() {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'ui-button ui-button--quiet activity-date-marker';
        const { date, status } = this.group;
        const label = date ? formatActivityMarginDate(date) : status === 'error' ? '!' : status === 'loading' ? '…' : '—';
        button.textContent = label;
        button.dataset.activityFrom = String(this.group.from ?? 0);
        button.setAttribute('aria-pressed', String(Boolean(this.group.selected)));
        const description = this.group.provisional ? `Edited: ${date}. Includes changes not yet recorded in Git history. Show this group’s activity.`
            : date ? `Last recorded change: ${date}. Show this group’s activity.`
                : status === 'error' ? 'Activity unavailable. Open activity to retry.'
                    : status === 'loading' ? 'Loading passage activity.'
                        : status === 'unrecorded' ? 'Changes not recorded in Git history. Show activity.' : 'Earlier activity is unknown. Show activity.';
        button.title = description; button.setAttribute('aria-label', description);
        button.addEventListener('mousedown', event => { if (event.button === 0) event.preventDefault(); });
        return button;
    }
}
class ActivitySpacer extends GutterMarker {
    toDOM() { const spacer = document.createElement('span'); spacer.className = 'activity-date-spacer'; spacer.textContent = '28 Sep 2026'; return spacer; }
}
function markerEntries(view) {
    const data = view.state.field(activityState);
    if (!data.enabled) return [];
    const passages = currentActivityPassages(view, view.viewport.from, view.viewport.to);
    const folds = foldedRanges(view.state);
    const groups = groupActivityPassages(passages).filter(p => {
        let hidden = false;
        folds.between(p.from, p.from, (from, to) => { if (from < p.from && to > p.from) hidden = true; });
        return !hidden;
    }).map(group => ({ ...group, selected: Boolean(data.scope && group.from < data.scope.to && group.to > data.scope.from) }));
    const entries = groups.map(group => ({ from: view.state.doc.lineAt(Math.max(view.viewport.from, group.from)).from, group }));
    if (!entries.length && (data.status === 'loading' || data.status === 'error')) entries.push({ from: view.state.doc.lineAt(view.viewport.from).from, group: { key: data.status, status: data.status } });
    return entries;
}

const markerPlugin = ViewPlugin.fromClass(class {
    constructor(view) { this.rebuild(view); }
    update(update) {
        if (update.docChanged || update.viewportChanged || update.geometryChanged || update.startState.field(activityState) !== update.state.field(activityState) || foldedRanges(update.startState) !== foldedRanges(update.state)) this.rebuild(update.view);
    }
    rebuild(view) {
        const data = view.state.field(activityState);
        view.dom.classList.toggle('activity-dates-enabled', data.enabled);
        const builder = new RangeSetBuilder(); let previous = -1;
        for (const entry of markerEntries(view)) if (entry.from !== previous) { builder.add(entry.from, entry.from, new ActivityMarker(entry.group)); previous = entry.from; }
        this.markers = builder.finish();
        const highlights = [];
        if (data.enabled && data.scope) {
            let position = view.state.doc.lineAt(Math.min(view.state.doc.length, Math.max(view.viewport.from, data.scope.from))).from;
            const limit = Math.min(view.viewport.to, data.scope.to);
            while (position < limit) {
                const line = view.state.doc.lineAt(position);
                highlights.push(Decoration.line({ class: 'activity-passage-selected' }).range(line.from));
                if (line.to === view.state.doc.length) break;
                position = line.to + 1;
            }
        }
        this.decorations = Decoration.set(highlights);
        view.requestMeasure({ key: this, read: () => view.dom.getBoundingClientRect().width, write: width => synchronizeEditorBlockActionLayout(view, width) });
    }
}, { decorations: value => value.decorations });

export const activityGutterExtension = [activityState, markerPlugin, gutter({
    class: 'cm-activityGutter',
    markers: view => view.plugin(markerPlugin)?.markers || RangeSet.empty,
    initialSpacer: () => new ActivitySpacer(),
    widgetMarker(view, _widget, block) {
        const entry = markerEntries(view).find(candidate => candidate.from >= block.from && candidate.from < block.to);
        return entry ? new ActivityMarker(entry.group) : null;
    },
    domEventHandlers: {
        click(view, line, event) {
            const button = event.target?.closest?.('.activity-date-marker');
            if (!button) return false;
            openActivity(view, activityGroupAt(view, Number(button.dataset.activityFrom) || line.from), button); return true;
        },
    },
})];
