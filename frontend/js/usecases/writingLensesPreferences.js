import { changeWritingLenses, normalizeWritingLenses, supportedWritingLenses } from '../core/writingLensesModel.js';

/** Serialize saves through injected persistence ports, retaining retryable choices. */
export function createWritingLensesPreferences({ load, save, onChange = () => {} }) {
    let preferences = normalizeWritingLenses();
    let status = 'loading';
    let error = '';
    let revision = 0;
    let savedRevision = 0;
    let saving = false;
    let disposed = false;
    const waiters = [];
    const snapshot = () => ({ preferences: normalizeWritingLenses(preferences), status, error });
    const publish = () => { if (!disposed) onChange(snapshot()); };
    async function restore() {
        status = 'loading'; error = ''; publish();
        try {
            const value = await load();
            if (disposed) return;
            preferences = supportedWritingLenses(value);
            status = 'saved';
        } catch (_) {
            if (disposed) return;
            status = 'load-error';
            error = 'Couldn’t load writing preferences. Retry before changing them.';
        }
        publish();
    }
    async function persist() {
        if (saving || disposed) return;
        saving = true;
        while (savedRevision < revision && !disposed) {
            const pendingRevision = revision;
            const pending = normalizeWritingLenses(preferences);
            status = 'saving'; error = ''; publish();
            try {
                await save(pending);
                savedRevision = pendingRevision;
            } catch (_) {
                if (pendingRevision !== revision) continue;
                status = 'save-error';
                error = 'Couldn’t save writing preferences. Your choices are kept here; retry to save them.';
                break;
            }
        }
        saving = false;
        if (status !== 'save-error') status = 'saved';
        publish();
        waiters.splice(0).forEach(resolve => resolve());
    }
    return {
        restore, snapshot,
        settled() { return saving ? new Promise(resolve => waiters.push(resolve)) : Promise.resolve(); },
        replace(value) {
            preferences = supportedWritingLenses(value);
            savedRevision = ++revision; status = 'saved'; error = ''; publish();
        },
        update(action) {
            if (disposed || status === 'loading' || status === 'load-error') return;
            const next = changeWritingLenses(preferences, action);
            if (JSON.stringify(next) === JSON.stringify(preferences)) return;
            preferences = next; revision += 1;
            publish();
            void persist();
        },
        retry() { return status === 'load-error' ? restore() : persist(); },
        destroy() { disposed = true; },
    };
}
