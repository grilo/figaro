import { EditorState, EditorSelection, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { activityEditDate, activityEditDateExtension, activityGutterExtension, activityState, currentActivityPassages, setActivityData, configureActivityGutter } from '../../../frontend/js/activityGutter.js';

const source = '# Heading\n\nFirst passage.\n\nSecond passage.';
const projection = {
    passages: [{ from: 0, to: 9, date: '2026-09-03', status: 'recorded', events: [0], title: 'Heading' },
        { from: 11, to: 25, date: '2026-09-07', status: 'recorded', events: [1], title: 'First passage.' },
        { from: 27, to: source.length, date: '2026-09-07', status: 'recorded', events: [1], title: 'Second passage.' }],
    events: [{ timestamp: 1 }, { timestamp: 2 }], partial: false,
};
function state() {
    let current = EditorState.create({ doc: source, extensions: [activityGutterExtension] });
    return current.update({ effects: setActivityData.of({ enabled: true, status: 'ready', projection }) }).state;
}
const passages = current => currentActivityPassages({ state: current });

test('known edits shift untouched passage ranges immediately without changing their dates', () => {
    const current = state().update({ changes: { from: 0, insert: 'New meeting.\n\n' } }).state;
    const old = passages(current).filter(p => p.status === 'recorded');
    expect(old.map(p => p.date)).toEqual(['2026-09-03', '2026-09-07', '2026-09-07']);
    expect(old[0].from).toBe('New meeting.\n\n'.length);
    expect(passages(current)[0].status).toBe('unrecorded');
});

test('editing one passage immediately clears its dated attribution while retaining its neighbors', () => {
    const current = state().update({ changes: { from: 12, to: 13, insert: 'x' } }).state;
    expect(passages(current).map(p => p.status)).toEqual(['recorded', 'unrecorded', 'recorded']);
    expect(passages(current).at(-1).date).toBe('2026-09-07');
});

test('removing a complete passage leaves no stale actionable marker', () => {
    const current = state().update({ changes: { from: 11, to: 27, insert: '' } }).state;
    const remaining = passages(current);
    expect(remaining.every(p => p.to > p.from)).toBe(true);
    expect(remaining.filter(p => p.status === 'recorded').map(p => p.title)).toEqual(['Heading', 'Second passage.']);
});

test('activity setting does not change content, selection, or editor undo state', () => {
    const current = state().update({ selection: EditorSelection.cursor(17) }).state;
    const hidden = current.update({ effects: setActivityData.of({ enabled: false }) }).state;
    expect(hidden.doc.toString()).toBe(source); expect(hidden.selection.main.head).toBe(17);
    expect(hidden.field(activityState).enabled).toBe(false);
    expect(passages(hidden)).toHaveLength(3);
});

test('year-bearing date markers keep full accessible dates and open a group without moving the cursor', () => {
    const parent = document.createElement('div'); document.body.append(parent);
    const open = jest.fn(); configureActivityGutter({ open });
    const view = new EditorView({ parent, state: EditorState.create({ doc: source, extensions: [markdown(), activityGutterExtension] }) });
    try {
        view.dispatch({ effects: setActivityData.of({ enabled: true, status: 'ready', projection }) });
        const controls = [...parent.querySelectorAll('.activity-date-marker')];
        expect(controls.map(control => control.textContent)).toEqual(['3 Sep 26', '7 Sep 26']);
        expect(controls[1].getAttribute('aria-label')).toContain('2026-09-07');
        const before = view.state.selection.main.head;
        controls[1].click();
        expect(open).toHaveBeenCalledTimes(1);
        expect(open.mock.calls[0][1].passages).toHaveLength(2);
        expect(view.state.selection.main.head).toBe(before);
    } finally { view.destroy(); parent.remove(); }
});

test('multiple edits in one passage publish a single pending range and clearing an owner removes its highlight', () => {
 let current = state().update({ effects: setActivityData.of({scope:{from:11,to:25}}) }).state;
 current=current.update({changes:[{from:12,to:13,insert:'x'},{from:18,to:19,insert:'y'}]}).state;
 expect(passages(current).filter(p=>p.status==='unrecorded')).toHaveLength(1);
 current=current.update({effects:setActivityData.of({clear:true})}).state;
 expect(current.field(activityState).scope).toBeNull(); expect(passages(current)).toEqual([]);
});

test('deleting the selected activity group clears its source highlight', () => {
 const current=state().update({effects:setActivityData.of({scope:{from:11,to:25}})}).state;
 expect(current.update({changes:{from:11,to:25,insert:''}}).state.field(activityState).scope).toBeNull();
});


test('new typing receives today immediately, retains it through projection, and yields to the recorded date', () => {
    let current = EditorState.create({ doc: '', extensions: [activityGutterExtension] });
    current = current.update({ effects: setActivityData.of({ enabled: true, status: 'loading' }) }).state;
    current = current.update({ changes: { from: 0, insert: 'hello world' }, annotations: activityEditDate.of('2026-09-07') }).state;
    expect(passages(current)[0]).toMatchObject({ date: '2026-09-07', provisional: true, status: 'unrecorded' });
    const pending = { passages: [{ from: 0, to: 11, status: 'unrecorded', date: '', events: [] }], events: [] };
    current = current.update({ effects: setActivityData.of({ status: 'ready', projection: pending }) }).state;
    expect(passages(current)[0]).toMatchObject({ date: '2026-09-07', provisional: true });
    current = current.update({ effects: setActivityData.of({ status: 'error', error: 'Git unavailable' }) }).state;
    expect(passages(current)[0].date).toBe('2026-09-07');
    current = current.update({ effects: setActivityData.of({ status: 'ready', projection: {
        ...pending, passages: [{ ...pending.passages[0], status: 'recorded', date: '2026-09-08' }],
    } }) }).state;
    expect(passages(current)[0]).toMatchObject({ date: '2026-09-08', status: 'recorded' });
    expect(passages(current)[0].provisional).toBeUndefined();
});

test('editing at midnight updates only the touched passage and maps other temporary dates through prepends', () => {
    let current = state().update({ changes: { from: 12, to: 13, insert: 'x' }, annotations: activityEditDate.of('2026-09-07') }).state;
    current = current.update({ changes: { from: 0, insert: 'New.\n\n' }, annotations: activityEditDate.of('2026-09-08') }).state;
    expect(passages(current).map(p => p.date)).toEqual(['2026-09-08', '2026-09-03', '2026-09-07', '2026-09-07']);
    expect(passages(current).filter(p => p.provisional).map(p => p.date)).toEqual(['2026-09-08', '2026-09-07']);
});

test('closing or reloading loses temporary dates without assigning today to existing unrecorded text', () => {
    let current = state().update({ changes: { from: 12, to: 13, insert: 'x' }, annotations: activityEditDate.of('2026-09-07') }).state;
    const pending = { ...projection, passages: projection.passages.map((p, i) => i === 1 ? { ...p, status: 'unrecorded', date: '' } : p) };
    current = current.update({ effects: [setActivityData.of({ clear: true }), setActivityData.of({ projection: pending })] }).state;
    expect(passages(current)[1].date).toBe('');
    const reopened = EditorState.create({ doc: current.doc, extensions: [activityGutterExtension] })
        .update({ effects: setActivityData.of({ enabled: true, status: 'ready', projection: pending }) }).state;
    expect(passages(reopened)[1].date).toBe('');
});

test('the edit-date adapter uses transaction time for typing and excludes programmatic document mounts', () => {
    let replacing = true;
    const dateForTime = jest.fn(() => '2026-09-07');
    let current = EditorState.create({ doc: '', extensions: [activityGutterExtension,
        activityEditDateExtension({ isDocumentReplacement: () => replacing, dateForTime })] });
    current = current.update({ changes: { from: 0, insert: 'Existing text.' } }).state;
    expect(dateForTime).not.toHaveBeenCalled();
    expect(passages(current)[0].date).toBe('');
    replacing = false;
    current = current.update({ changes: { from: 0, insert: 'New ' }, annotations: Transaction.time.of(1234) }).state;
    expect(dateForTime).toHaveBeenCalledWith(1234);
    expect(passages(current)[0]).toMatchObject({ date: '2026-09-07', provisional: true });
});

test('a same-day draft joins the recorded marker and updates its tooltip until Git confirms it', () => {
    const parent = document.createElement('div'); document.body.append(parent);
    const view = new EditorView({ parent, state: state() });
    try {
        view.dispatch({ changes: { from: 28, to: 29, insert: 'x' }, annotations: activityEditDate.of('2026-09-07') });
        let controls = [...parent.querySelectorAll('.activity-date-marker')];
        expect(controls.map(control => control.textContent)).toEqual(['3 Sep 26', '7 Sep 26']);
        expect(controls[1].getAttribute('aria-label')).toContain('not yet recorded');
        view.dispatch({ effects: setActivityData.of({ status: 'ready', projection }) });
        controls = [...parent.querySelectorAll('.activity-date-marker')];
        expect(controls[1].getAttribute('aria-label')).toContain('Last recorded change');
        expect(controls[1].getAttribute('aria-label')).not.toContain('not yet recorded');
    } finally { view.destroy(); parent.remove(); }
});
