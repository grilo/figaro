import { wheelScrollStep, wheelScrollTarget } from '../core/wheelScrollModel.js';

/** Own one interruptible animation; all time and scroll effects are injected. */
export function createWheelScroll({ read, write, requestFrame, cancelFrame, now }) {
    let frame = null, target = null, lastTime = 0, expected = null, position = 0;
    function cancel() {
        if (frame !== null) cancelFrame(frame);
        frame = target = expected = null;
    }
    function tick(time) {
        frame = null;
        if (target === null) return;
        const { offset, maximum } = read();
        if (expected !== null && Math.abs(offset - expected) > 1) { cancel(); return; }
        target = Math.max(0, Math.min(maximum, target));
        const next = wheelScrollStep(position, target, time - lastTime);
        lastTime = time;
        position = next;
        write(next);
        expected = read().offset; // Native scroll offsets can be rounded.
        if (Math.abs(expected - target) < 1) { write(target); cancel(); return; }
        frame = requestFrame(tick);
    }
    return {
        cancel,
        scroll(delta) {
            const { offset, maximum, pageHeight } = read();
            if (expected !== null && Math.abs(offset - expected) > 1) cancel();
            const next = wheelScrollTarget({ offset, target: target ?? offset, delta, maximum, pageHeight });
            if (next === offset) { cancel(); return false; }
            if (target === null) position = offset;
            target = next;
            if (frame === null) { lastTime = now() - 16; tick(now()); }
            return true;
        },
    };
}
