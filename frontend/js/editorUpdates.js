import { EDITOR_UPDATE_CONSUMERS, editorConsumerReasons, editorUpdateReasons } from './core/editorUpdateContract.js';
import { editorDiagnostics, traceEditorWork } from './editorDiagnostics.js';
import { log } from './log.js';

const subscriptions = new Set();

/** Named subscriptions declare dependencies and scheduling in the pure contract. */
export function subscribeEditorUpdates(name, callback) {
    const contract = EDITOR_UPDATE_CONSUMERS[name];
    if (!contract) throw new Error(`Unknown editor update consumer: ${name}`);
    const subscription = { name, callback, pending: null, disposed: false };
    subscriptions.add(subscription);
    return () => { subscription.disposed = true; subscription.pending = null; subscriptions.delete(subscription); };
}

function invoke(subscription, delivery, phase) {
    if (subscription.disposed) return;
    try {
        traceEditorWork(subscription.name, delivery.reasons.join(', '),
            () => subscription.callback(delivery.detail), delivery.cause, phase);
    } catch (error) { log.error(`Editor consumer ${subscription.name} failed:`, error); }
}

export function publishEditorUpdate(detail) {
    const reasons = editorUpdateReasons(detail);
    for (const subscription of subscriptions) {
        const selected = editorConsumerReasons(subscription.name, reasons);
        if (!selected.length) continue;
        const delivery = { detail, reasons: selected, cause: editorDiagnostics.capture() };
        if (EDITOR_UPDATE_CONSUMERS[subscription.name].schedule === 'immediate') invoke(subscription, delivery, 'immediate');
        else {
            const scheduled = subscription.pending !== null;
            subscription.pending = delivery;
            if (!scheduled) queueMicrotask(() => {
                const pending = subscription.pending;
                subscription.pending = null;
                if (pending) invoke(subscription, pending, 'microtask');
            });
        }
    }
}
