/** Timing is observational: reporting never delays, retries, or changes work. */
export function createStartupTimings({ now }) {
    let send = null, complete = false, sending = false;
    const pending = [], seen = new Set();
    function deliverNext() {
        if (!send || sending || pending.length === 0) return;
        sending = true;
        const event = pending.shift();
        const finished = () => { sending = false; deliverNext(); };
        // Wails calls can complete out of order. Serialize only diagnostics;
        // application work never waits for this bounded delivery queue.
        try { Promise.resolve(send(event)).then(finished, finished); }
        catch (_) { finished(); }
    }
    function record(stage, phase, duration = 0) {
        const key = `${stage}:${phase}`;
        if (complete || seen.has(key) || seen.size >= 64) return;
        seen.add(key);
        const event = { stage, phase, elapsed_ms: Math.max(0, now()), duration_ms: Math.max(0, duration) };
        pending.push(event);
        deliverNext();
    }
    return {
        connect(port) { send = port; deliverNext(); },
        mark(stage) { record(stage, 'mark'); if (stage === 'ready') complete = true; },
        fail(stage) { record(stage, 'error'); },
        async measure(stage, work) {
            const start = now();
            record(stage, 'begin');
            try {
                const result = await work();
                record(stage, 'end', now() - start);
                return result;
            } catch (error) {
                record(stage, 'error', now() - start);
                throw error;
            }
        },
    };
}
