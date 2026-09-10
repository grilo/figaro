import { scheduleDiagramAfterQuiet } from '../frontend/js/usecases/diagramQuietScheduler.js';

function fixture() {
    let clock = 0, activity, busy = false;
    const timers = new Map(), idles = new Map(); let sequence = 0;
    const stop = jest.fn(), run = jest.fn();
    const task = scheduleDiagramAfterQuiet(run, {
        now: () => clock,
        setTimer: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, at: clock + delay }); return id; },
        clearTimer: id => timers.delete(id),
        requestIdle: callback => { const id = ++sequence; idles.set(id, callback); return id; },
        cancelIdle: id => idles.delete(id),
        observeActivity: callback => { activity = callback; return stop; },
        isBusy: () => busy,
    });
    return { task, run, stop, timers, idles, activity: () => activity(), busy: value => { busy = value; },
        tick(ms) { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.callback(); } },
        idle() { const callbacks = [...idles.values()]; idles.clear(); callbacks.forEach(callback => callback()); },
    };
}

test('diagram scheduling waits for typing and scroll quiet before the idle slot', () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) { f.tick(33); f.activity(); f.idle(); }
    expect(f.run).not.toHaveBeenCalled();
    f.tick(119); f.idle(); expect(f.run).not.toHaveBeenCalled();
    f.tick(1); expect(f.run).not.toHaveBeenCalled();
    f.idle(); expect(f.run).toHaveBeenCalledTimes(1); expect(f.stop).toHaveBeenCalledTimes(1);
});

test('a keystroke after an idle slot was queued invalidates that slot even if cancellation races', () => {
    const f = fixture(); f.tick(120);
    const stale = [...f.idles.values()][0];
    f.activity(); stale(); expect(f.run).not.toHaveBeenCalled();
    f.tick(120); f.idle(); expect(f.run).toHaveBeenCalledTimes(1);
});

test('IME composition blocks idle timeout execution until composition has ended and input is quiet', () => {
    const f = fixture(); f.tick(120); f.busy(true); f.idle();
    for (let i = 0; i < 10; i++) { f.tick(500); f.idle(); }
    expect(f.run).not.toHaveBeenCalled();
    f.busy(false); f.activity(); f.tick(120); f.idle();
    expect(f.run).toHaveBeenCalledTimes(1);
});

test('destroying a scheduled diagram removes observers and rejects late timer/idle callbacks', () => {
    const f = fixture(); const timer = [...f.timers.values()][0].callback;
    f.tick(120); const idle = [...f.idles.values()][0];
    f.task.cancel(); f.task.cancel(); timer(); idle(); f.activity();
    expect(f.run).not.toHaveBeenCalled(); expect(f.stop).toHaveBeenCalledTimes(1);
    expect(f.timers.size).toBe(0); expect(f.idles.size).toBe(0);
});
