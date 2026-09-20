/** Bounded opt-in tracing. Clock is injected; records never retain source or DOM. */
export function createInteractionTrace({ now }) {
    let enabled = false, limit = 200, nextId = 0, active = null;
    let records = [];
    const find = id => records.find(record => record.id === id);
    const capture = () => enabled ? active : null;
    function begin(kind, reasons) {
        if (!enabled) return () => {};
        const record = { id: ++nextId, kind, reasons: [...reasons], startedAt: now(), durationMs: 0, work: [], counters: {} };
        records.push(record);
        if (records.length > limit) records.shift();
        const previous = active;
        active = record.id;
        let finished = false;
        return () => {
            if (finished) return;
            finished = true;
            record.durationMs += now() - record.startedAt;
            if (active === record.id) active = previous;
        };
    }
    function interaction(kind, reasons, operation) {
        if (!enabled) return operation();
        const finish = begin(kind, reasons);
        try { return operation(); } finally { finish(); }
    }
    function run(consumer, reason, operation, cause = active, phase = 'immediate') {
        const record = enabled && find(cause);
        if (!record) return operation();
        const previous = active;
        active = cause;
        const start = now();
        try { return operation(); }
        finally {
            if (record.work.length < 500) record.work.push({ consumer, reason, phase, durationMs: now() - start });
            else record.droppedWork = (record.droppedWork || 0) + 1;
            active = previous;
        }
    }
    function count(name, amount = 1) {
        const record = enabled && find(active);
        if (record) record.counters[name] = (record.counters[name] || 0) + amount;
    }
    function deferred(consumer, reason, operation, phase) {
        if (!enabled) return operation;
        const cause = capture();
        return (...args) => run(consumer, reason, () => operation(...args), cause, phase);
    }
    return {
        start(options = {}) {
            limit = Math.max(1, Math.min(1000, Math.trunc(Number(options.limit) || 200)));
            records = []; active = null; enabled = true;
        },
        stop() { enabled = false; active = null; return this.snapshot(); },
        snapshot() { return records.map(record => ({ ...record, reasons: [...record.reasons], counters: { ...record.counters }, work: record.work.map(work => ({ ...work })) })); },
        clear() { records = []; },
        enabled: () => enabled,
        capture, begin, interaction, run, count, deferred,
    };
}
