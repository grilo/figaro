import { supportedWritingLenses } from '../core/writingLensesModel.js';

/** Drain document writes before replacing their choices atomically through the vault port. */
export function createWritingLensesApplyAll({ entries, save, onChange = () => {} }) {
    let busy = false, error = '', pending;
    const snapshot = () => ({ applying: busy, applyError: error });
    async function apply(value) {
        if (busy) return;
        pending = supportedWritingLenses(value);
        busy = true; error = ''; onChange(snapshot());
        try {
            await Promise.all(entries().map(async entry => { await entry.ready; await entry.controller.settled(); }));
            await save(pending);
            // Documents opened while the write was in progress may still be loading.
            // Refresh all cached choices only after those earlier reads finish.
            await Promise.all(entries().map(entry => entry.ready));
            entries().forEach(entry => entry.controller.replace(pending));
        } catch (_) {
            error = 'Couldn’t apply choices to all documents. Retry to apply them.';
        } finally { busy = false; onChange(snapshot()); }
    }
    return { apply, snapshot, retry: () => apply(pending) };
}
