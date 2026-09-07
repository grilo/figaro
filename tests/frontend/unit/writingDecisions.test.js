import { writingTestPorts } from '../support/writingPorts.js';
import { createWritingDecisions as createDecisions } from '../../../frontend/js/usecases/writingDecisions.js';
import { createWritingDecision, writingDecisionRange } from '../../../frontend/js/core/writingDecisionsModel.js';

const createWritingDecisions = ports => createDecisions({ track: writingTestPorts.trackDecisions, ...ports });

const decision = { id: 'one', type: 'acronym', acronym: 'SLO', language: 'en-US' };
const command = { action: 'add', decision };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };
function occurrenceFixture() {
    const source = ['First context. We utilize original words.', 'Second context. We utilize clear language.', 'Third context. We utilize other examples.']
        .join('\n\n' + 'Neutral context. '.repeat(8) + '\n\n') + ' Closing context.'.repeat(8);
    const records = [...source.matchAll(/utilize/g)].map((match, i) => createWritingDecision({
        kind: 'lexicon.complex-word', title: 'Simpler word', actual: 'utilize', from: match.index, to: match.index + 7,
    }, source, 'en-US', 'occurrence', ['A', 'B', 'C'][i]));
    return { source, records };
}

test('reload after an uncertain removal waits for in-flight tracking without replacing the surviving decision by index', async () => {
    const { source, records: [a, b] } = occurrenceFixture();
    let stored = [a, b]; const pendingTrack = deferred();
    const track = jest.fn(writingTestPorts.trackDecisions), onChange = jest.fn();
    const controller = createWritingDecisions({ load: async () => stored, track, onChange,
        change: async () => { stored = [b]; throw new Error('reply lost'); } });
    await controller.restore(); controller.observeSource(source); await controller.flushSource();
    await expect(controller.change({ action: 'remove', id: a.id })).rejects.toThrow('confirm');
    track.mockImplementationOnce(input => pendingTrack.promise.then(() => writingTestPorts.trackDecisions(input)));
    const after = source + ' More.';
    controller.observeSource(after, [{ from: source.length, to: source.length, insertedLength: 6 }]);
    const tracking = controller.flushSource(), reload = controller.reconcile(); await settle();
    expect(controller.snapshot().status).toBe('loading');
    pendingTrack.resolve(); await tracking; await reload;
    expect(controller.snapshot()).toMatchObject({ decisions: [b], status: 'saved', tracking: false, activeIds: ['B'] });
    expect(stored).toEqual([b]);
    expect(onChange.mock.calls.filter(([state]) => state.status === 'saved').at(-1)[0].decisions).toEqual([b]);
    controller.destroy();
});

test.each(['complete', 'fail'])('reload retains queued edits and newly loaded decision IDs when the active tracking job does %s', async outcome => {
    const { source, records: [a, b, c] } = occurrenceFixture();
    let stored = [a, b]; const pendingTrack = deferred(), pendingLoad = deferred();
    const load = jest.fn(async () => stored), track = jest.fn(writingTestPorts.trackDecisions);
    const change = jest.fn(async command => {
        const anchors = new Map(command.anchors.map(item => [item.id, item]));
        stored = stored.map(item => anchors.get(item.id) || item); return stored;
    });
    const controller = createWritingDecisions({ load, change, track });
    await controller.restore(); controller.observeSource(source); await controller.flushSource();
    track.mockImplementationOnce(input => pendingTrack.promise.then(() => writingTestPorts.trackDecisions(input)));
    const first = source + ' More.';
    controller.observeSource(first, [{ from: source.length, to: source.length, insertedLength: 6 }]);
    const tracking = controller.flushSource().catch(() => {});
    load.mockReturnValueOnce(pendingLoad.promise);
    const reload = controller.reconcile();
    expect(controller.reconcile()).toBe(reload); // Do not let repeated Reload clicks race each other.
    const from = first.indexOf('Second context.'), to = from + 'Second context.'.length;
    const after = first.slice(0, from) + 'Revised second context.' + first.slice(to);
    controller.observeSource(after, [{ from, to, insertedLength: 'Revised second context.'.length }]);
    stored = [c, b]; pendingLoad.resolve(stored); await settle();
    if (outcome === 'fail') pendingTrack.reject(new Error('worker unavailable')); else pendingTrack.resolve();
    await tracking; await reload; await controller.flushAnchors();
    const state = controller.snapshot();
    expect(state).toMatchObject({ status: 'saved', tracking: false, activeIds: ['C', 'B'] });
    expect(state.decisions.map(item => item.id)).toEqual(['C', 'B']);
    expect(state.decisions[1].before).toContain('Revised second context.');
    expect(writingDecisionRange(after, state.decisions[1]).from).toBe(after.indexOf('utilize', from));
    expect(stored).toEqual(state.decisions);
    expect(change.mock.calls.flatMap(([command]) => command.anchors).every(item => item.id !== 'A')).toBe(true);
    expect(load).toHaveBeenCalledTimes(2); controller.destroy();
});

test('disposal during a saved-decision reload cannot publish a late tracking or storage response', async () => {
    const { source, records } = occurrenceFixture(); const job = deferred(), loaded = deferred(), onChange = jest.fn();
    const load = jest.fn(async () => records), track = jest.fn(writingTestPorts.trackDecisions);
    const controller = createWritingDecisions({ load, track, change: jest.fn(), onChange });
    await controller.restore(); controller.observeSource(source); await controller.flushSource();
    track.mockReturnValueOnce(job.promise); controller.observeSource(source + ' More.');
    const tracking = controller.flushSource(); load.mockReturnValueOnce(loaded.promise); const reload = controller.reconcile();
    controller.destroy(); const calls = onChange.mock.calls.length;
    loaded.resolve([]); job.resolve({ decisions: records, activeIds: [] }); await tracking; await reload;
    expect(onChange).toHaveBeenCalledTimes(calls);
});

test('review decisions appear only after saving, survive a fresh controller, and can be restored', async () => {
    let stored = [];
    const ports = { load: async () => stored, change: async command => {
        stored = command.action === 'add' ? [command.decision] : []; return stored;
    } };
    const first = createWritingDecisions(ports); await first.restore();
    const pending = first.change(command);
    expect(first.snapshot()).toMatchObject({ status: 'saving', decisions: [] });
    await pending; first.destroy();
    const reopened = createWritingDecisions(ports); await reopened.restore();
    expect(reopened.snapshot()).toMatchObject({ decisions: [decision], status: 'saved' });
    await reopened.change({ action: 'remove', id: 'one' }); expect(stored).toEqual([]);
});

test('failed load blocks writes; failed save retains previous decisions and retries the identical command', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('corrupt')).mockResolvedValue([]);
    const change = jest.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue([decision]);
    const controller = createWritingDecisions({ load, change }); await controller.restore();
    await expect(controller.change(command)).rejects.toThrow('available'); expect(change).not.toHaveBeenCalled();
    await controller.retry();
    await expect(controller.change(command)).rejects.toThrow('Couldn’t confirm');
    expect(controller.snapshot()).toMatchObject({ decisions: [], status: 'save-error' });
    await expect(controller.change({ action: 'remove', id: 'one' })).rejects.toThrow('previous');
    await controller.retry(); expect(change.mock.calls[0][0]).toBe(change.mock.calls[1][0]);
    expect(controller.snapshot()).toMatchObject({ decisions: [decision], status: 'saved' });
});

test('pending writes stay with their document and late completion cannot publish into a disposed workspace', async () => {
    let finish;
    const onChange = jest.fn(), saveFirst = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    const first = createWritingDecisions({ load: async () => [], change: saveFirst, onChange });
    const second = createWritingDecisions({ load: async () => [], change: jest.fn() });
    await first.restore(); await second.restore();
    const pending = first.change(command);
    await expect(first.change(command)).rejects.toThrow('available');
    first.destroy(); const calls = onChange.mock.calls.length; finish([decision]); await pending;
    expect(onChange).toHaveBeenCalledTimes(calls); expect(second.snapshot().decisions).toEqual([]);
});

test('capacity rejection explains the limit and permits removal and another save without restarting', async () => {
    const change = jest.fn().mockRejectedValueOnce(new Error('this document has too many saved review decisions')).mockResolvedValueOnce([]).mockResolvedValueOnce([decision]);
    const controller = createWritingDecisions({ load: async () => [decision], change }); await controller.restore();
    await expect(controller.change(command)).rejects.toThrow('1,000');
    expect(controller.snapshot().status).toBe('save-rejected');
    await controller.change({ action: 'remove', id: 'one' });
    await controller.change(command); expect(controller.snapshot()).toMatchObject({ decisions: [decision], status: 'saved' });
});

test('reloading after an uncertain write reconciles actual stored decisions and releases the pending command', async () => {
    let stored = [];
    const controller = createWritingDecisions({ load: async () => stored, change: async command => {
        if (command.action === 'add') { stored = [command.decision]; throw new Error('reply lost'); }
        stored = []; return stored;
    } });
    await controller.restore(); await expect(controller.change(command)).rejects.toThrow('confirm');
    await controller.reconcile(); expect(controller.snapshot().decisions).toEqual([decision]);
    await controller.change({ action: 'remove', id: 'one' }); expect(stored).toEqual([]);
});

test('nearby edits made during an anchor save are queued and persisted after the in-flight save completes', async () => {
    const original = 'Before our discussion. We utilize clear language for readers. After the draft.';
    const occurrence = { id: 'ignored', type: 'occurrence', text: 'utilize', language: 'en-US', kind: 'lexicon.complex-word',
        before: 'Before our discussion. We ', after: ' clear language for readers. After the draft.' };
    const callbacks = [];
    let complete;
    const change = jest.fn(() => new Promise(resolve => { complete = resolve; }));
    const controller = createWritingDecisions({ load: async () => [occurrence], change,
        schedule: callback => { callbacks.push(callback); return callbacks.length; }, unschedule: jest.fn() });
    await controller.restore(); controller.observeSource(original);
    const firstEdit = original.replace('clear', 'concise'); controller.observeSource(firstEdit);
    await controller.flushSource();
    const pending = controller.flushAnchors(); await Promise.resolve(); await Promise.resolve();
    const firstAnchor = change.mock.calls[0][0].anchors[0];
    controller.observeSource(firstEdit.replace('Before our discussion', 'Following our discussion'));
    await callbacks.at(-1)(); // A timer that fires while the first write is still pending.
    expect(change).toHaveBeenCalledTimes(1);
    complete([firstAnchor]); await pending;
    expect(controller.snapshot().decisions[0].before).toContain('Following our discussion');
    callbacks.at(-1)(); await Promise.resolve(); await Promise.resolve();
    expect(change).toHaveBeenCalledTimes(2);
    const lastAnchor = change.mock.calls[1][0].anchors[0];
    expect(lastAnchor).toMatchObject({ before: 'Following our discussion. We ', after: ' concise language for readers. After the draft.' });
    complete([lastAnchor]); await Promise.resolve();
    controller.destroy();
    const reopened = createWritingDecisions({ load: async () => [lastAnchor], change }); await reopened.restore();
    expect(reopened.snapshot().decisions).toEqual([lastAnchor]); reopened.destroy();
});

test('source observation is deferred and never calls a tracking port or reads the document during typing', async () => {
    const callbacks = [], read = jest.fn(() => 'We utilize ordinary words.'), track = jest.fn(writingTestPorts.trackDecisions);
    const controller = createWritingDecisions({ load: async () => [decision], change: jest.fn(), track,
        schedule: callback => { callbacks.push(callback); return callbacks.length; }, unschedule: jest.fn() });
    await controller.restore(); controller.observeSource(read, [{ from: 0, to: 0, insertedLength: 1 }]);
    expect(read).not.toHaveBeenCalled(); expect(track).not.toHaveBeenCalled();
    await controller.flushSource();
    expect(read).toHaveBeenCalledTimes(1); expect(track).toHaveBeenCalledTimes(1); controller.destroy();
});

test('a failed background decision job stays recoverable and cannot expose unchecked suppressions', async () => {
    const track = jest.fn().mockRejectedValueOnce(new Error('worker timed out')).mockImplementation(writingTestPorts.trackDecisions);
    const controller = createWritingDecisions({ load: async () => [decision], change: jest.fn(), track });
    await controller.restore(); controller.observeSource('An SLO is ready.');
    await expect(controller.flushSource()).rejects.toThrow('timed out');
    expect(controller.snapshot()).toMatchObject({ status: 'tracking-error', tracking: true });
    await controller.retry(); expect(controller.snapshot()).toMatchObject({ status: 'saved', tracking: false, activeIds: ['one'] });
    controller.destroy();
});

test('an uncertain pending Ignore retries its immutable command but persists the safe deletion anchor', async () => {
    const original = 'Before a distinctive context. utilize original wording.\n\nBefore a distinctive context. utilize different wording.';
    const from = original.indexOf('utilize');
    const occurrence = { id: 'ignored', type: 'occurrence', language: 'en-US', text: 'utilize', kind: 'lexicon.complex-word',
        before: original.slice(0, from), after: original.slice(from + 7, from + 71) };
    let reject, saved;
    const change = jest.fn(command => change.mock.calls.length === 1 ? new Promise((_, fail) => { reject = fail; })
        : Promise.resolve(saved = command.action === 'reanchor' ? command.anchors : [command.decision]));
    const controller = createWritingDecisions({ load: async () => [], change });
    await controller.restore(); controller.observeSource(original); await controller.flushSource();
    const command = { action: 'add', decision: occurrence }, immutable = JSON.stringify(command);
    const pending = controller.change(command); const failure = expect(pending).rejects.toThrow('confirm');
    const cut = original.indexOf('\n\n') + 2;
    controller.observeSource(original.slice(cut), [{ from: 0, to: cut, insertedLength: 0 }]);
    reject(new Error('reply lost')); await failure;
    await controller.retry();
    expect(JSON.stringify(command)).toBe(immutable); expect(change.mock.calls[1][0]).toBe(command);
    expect(controller.snapshot().decisions[0].exactOnly).toBe(true);
    await controller.flushAnchors(); expect(saved[0].exactOnly).toBe(true); controller.destroy();
});


test.each(['tracking first', 'load first'])('Retry recovers overlapping reload and tracking failures: %s', async order => {
    const { source, records: [a, b] } = occurrenceFixture(); let stored = [a, b];
    const loadJob = deferred(), trackJob = deferred();
    const load = jest.fn(async () => stored), track = jest.fn(writingTestPorts.trackDecisions);
    const change = jest.fn(async command => {
        if (command.action === 'remove') { stored = [b]; throw new Error('reply lost'); }
        stored = stored.map(item => command.anchors.find(anchor => anchor.id === item.id) || item); return stored;
    });
    const controller = createWritingDecisions({ load, change, track });
    await controller.restore(); controller.observeSource(source); await controller.flushSource();
    await expect(controller.change({ action: 'remove', id: a.id })).rejects.toThrow('confirm');
    track.mockReturnValueOnce(trackJob.promise); const first = source + ' More.';
    controller.observeSource(first, [{ from: source.length, to: source.length, insertedLength: 6 }]);
    const tracking = controller.flushSource().catch(() => {}); load.mockReturnValueOnce(loadJob.promise);
    const reload = controller.reconcile();
    if (order === 'tracking first') { trackJob.reject(new Error('worker failed')); await tracking; loadJob.reject(new Error('load failed')); }
    else { loadJob.reject(new Error('load failed')); await reload; trackJob.reject(new Error('worker failed')); }
    await tracking; await reload;
    expect(controller.snapshot().status).toBe('tracking-error');
    const next = first.replace('Second context.', 'Revised second context.');
    const at = first.indexOf('Second context.');
    controller.observeSource(next, [{ from: at, to: at + 'Second context.'.length, insertedLength: 'Revised second context.'.length }]);
    await controller.retry(); await controller.flushAnchors();
    expect(controller.snapshot()).toMatchObject({ status: 'saved', tracking: false, activeIds: ['B'] });
    expect(controller.snapshot().decisions.map(item => item.id)).toEqual(['B']);
    expect(controller.snapshot().decisions[0].before).toContain('Revised second context.');
    expect(load).toHaveBeenCalledTimes(3);
    expect(change.mock.calls.filter(([command]) => command.action === 'remove')).toHaveLength(1);
    expect(stored).toEqual(controller.snapshot().decisions); controller.destroy();
});
