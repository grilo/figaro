import { createInteractionTrace } from '../../../frontend/js/usecases/interactionTrace.js';

describe('bounded interaction diagnostics', () => {
    test('disabled tracing does not read clocks, wrap deferred work, or retain values', () => {
        const now = jest.fn(), trace = createInteractionTrace({ now });
        const callback = jest.fn(() => 42);
        expect(trace.interaction('selection', [], () => trace.run('cursor', 'selection', callback))).toBe(42);
        expect(trace.deferred('late', 'selection', callback, 'frame')).toBe(callback);
        trace.count('read');
        expect(trace.snapshot()).toEqual([]);
        expect(now).not.toHaveBeenCalled();
    });
    test('deferred work keeps its cause, overlapping transactions stay separate, and snapshots are detached', () => {
        let time = 0; const trace = createInteractionTrace({ now: () => time++ });
        trace.start();
        let deferred;
        trace.interaction('transaction', ['selection'], () => {
            trace.run('cursor', 'selection', () => trace.count('notifications.tabCursors'));
            deferred = trace.deferred('viewport', 'selection', () => trace.count('geometry.cursor'), 'frame');
        });
        trace.interaction('transaction', ['document'], () => trace.count('parse.math'));
        deferred();
        const result = trace.stop();
        expect(result[0].counters).toEqual({ 'notifications.tabCursors': 1, 'geometry.cursor': 1 });
        expect(result[0].work.map(work => work.consumer)).toEqual(['cursor', 'viewport']);
        expect(result[0].work[1].phase).toBe('frame');
        expect(result[1].counters).toEqual({ 'parse.math': 1 });
        result[0].work[0].consumer = 'changed'; result[0].counters.fake = 1;
        expect(trace.snapshot()[0].work[0].consumer).toBe('cursor');
        expect(trace.snapshot()[0].counters.fake).toBeUndefined();
    });
    test('eviction, failure, stop and restart cannot attach work to another interaction', () => {
        const trace = createInteractionTrace({ now: () => 1 }); trace.start({ limit: 1 });
        let old;
        expect(() => trace.interaction('old', [], () => {
            old = trace.deferred('late', 'old', () => trace.count('old'), 'frame');
            throw new Error('failure');
        })).toThrow('failure');
        trace.interaction('new', [], () => trace.count('new'));
        old(); expect(trace.snapshot()[0].counters).toEqual({ new: 1 });
        trace.stop(); old(); trace.start(); old();
        expect(trace.snapshot()).toEqual([]);
    });
});
