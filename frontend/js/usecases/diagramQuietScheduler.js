/** Wait for a quiet input/scroll interval, then yield to the browser's idle queue.
 * All time, activity observation, and composition state come from injected ports.
 */
export function scheduleDiagramAfterQuiet(callback, {
    now, setTimer, clearTimer, requestIdle, cancelIdle, observeActivity,
    isBusy = () => false, quietMs = 120,
}) {
    let timer = null;
    let idle = null;
    let stopped = false;
    let revision = 0;
    let quietAt = now() + quietMs;
    let stopObserving = () => {};
    const clear = () => {
        if (timer !== null) clearTimer(timer);
        if (idle !== null) cancelIdle(idle);
        timer = idle = null;
    };
    const cancel = () => {
        if (stopped) return;
        stopped = true;
        revision++;
        clear();
        stopObserving();
    };
    const wait = () => {
        if (stopped) return;
        clear();
        const ticket = ++revision;
        timer = setTimer(() => {
            if (stopped || ticket !== revision) return;
            timer = null;
            if (isBusy()) {
                quietAt = now() + quietMs;
                wait();
                return;
            }
            idle = requestIdle(() => {
                if (stopped || ticket !== revision) return;
                idle = null;
                // An idle timeout is not permission to run during composition.
                if (now() < quietAt || isBusy()) {
                    quietAt = Math.max(quietAt, now() + quietMs);
                    wait();
                    return;
                }
                cancel();
                callback();
            });
        }, Math.max(0, quietAt - now()));
    };
    stopObserving = observeActivity(() => {
        if (stopped) return;
        quietAt = now() + quietMs;
        wait();
    });
    wait();
    return { cancel };
}
