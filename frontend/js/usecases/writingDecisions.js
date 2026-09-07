/** One document's durable decisions, through injected storage and background tracking ports. */
import { writingDecisionFailure } from '../core/writingDecisionsModel.js';
export function createWritingDecisions({ load, change, track, schedule, unschedule, onChange = () => {} }) {
    let decisions = [], status = 'loading', error = '', pending, disposed = false;
    let source, timer, sourceTimer, sourceWork, restoreWork, trackingError = '', activeIds, version = 0;
    const edits = [], anchors = new Map();
    const sourceBlocked = () => status === 'loading' || status === 'load-error';
    const snapshot = () => ({ decisions: decisions.map(item => ({ ...item })), status: trackingError ? 'tracking-error' : status,
        error: trackingError || error, tracking: Boolean(edits.length || sourceWork), activeIds, version });
    const publish = (reason = 'storage') => { if (!disposed) { version++; onChange(snapshot(), reason); } };
    const scheduleAnchors = () => {
        if (!anchors.size || !schedule || disposed) return;
        unschedule?.(timer);
        timer = schedule(() => { void flushAnchors().catch(() => {}); }, 500);
    };
    const scheduleSource = () => {
        if (!schedule || sourceTimer || sourceWork || disposed || sourceBlocked()) return;
        sourceTimer = schedule(() => { sourceTimer = undefined; void flushSource().catch(() => {}); }, 0);
    };
    function observeSource(next, changes) {
        if (disposed || (typeof next === 'string' && next === source && !edits.length)) return;
        edits.push({ next, changes }); scheduleSource();
    }
    async function flushSource() {
        unschedule?.(sourceTimer); sourceTimer = undefined;
        if (sourceWork) { await sourceWork; if (edits.length) return flushSource(); return; }
        if (!edits.length || disposed || sourceBlocked()) return;
        const work = async () => {
            while (edits.length && !disposed && !sourceBlocked()) {
                const edit = edits[0], next = typeof edit.next === 'function' ? edit.next() : edit.next;
                // The pending command remains immutable for an idempotent storage retry.
                // Its separate anchor follows every edit, including deletion, before publication.
                const records = [...decisions];
                if (pending?.action === 'add' && !records.some(item => item.id === pending.decision.id)) records.push(anchors.get(pending.decision.id) || pending.decision);
                const value = records.length ? await track({ decisions: records, before: source ?? next, after: next, changes: edit.changes })
                    : { decisions: [], activeIds: [] };
                if (disposed) return;
                const mapped = new Map(value.decisions.map(item => [item.id, item]));
                for (const record of records) {
                    const next = mapped.get(record.id);
                    if (next && JSON.stringify(next) !== JSON.stringify(record)) anchors.set(next.id, next);
                }
                decisions = decisions.map(item => mapped.get(item.id) || item);
                activeIds = value.activeIds; source = next; edits.shift();
            }
            trackingError = ''; scheduleAnchors();
        };
        sourceWork = work();
        try { await sourceWork; }
        catch (cause) { trackingError = 'Couldn’t refresh saved review decisions. Retry before reviewing this note.'; throw cause; }
        finally { sourceWork = undefined; publish('source'); }
    }
    function restore() {
        if (disposed) return Promise.resolve();
        if (!restoreWork) restoreWork = restoreSaved().finally(() => { restoreWork = undefined; });
        return restoreWork;
    }
    async function restoreSaved() {
        status = 'loading'; error = ''; publish();
        try {
            const value = await load();
            if (disposed) return;
            // Finish the active edit against its original decision set. Further
            // edits stay queued until the authoritative loaded set is installed.
            // A failed job leaves its edit queued for retry against that set.
            await sourceWork?.catch(() => {});
            if (disposed) return;
            // Reconcile any uncertain add with its known edits before exposing it.
            decisions = value.map(item => anchors.get(item.id) || item);
            for (const id of anchors.keys()) if (!value.some(item => item.id === id)) anchors.delete(id);
            pending = undefined; status = 'saved';
            if (source !== undefined && !edits.length) edits.push({ next: source });
            await flushSource(); scheduleAnchors();
        } catch (_) {
            if (disposed) return;
            // A tracking failure must not hide a failed load's prerequisite.
            // Failures after installation belong to tracking, with status saved.
            if (status === 'loading') { status = 'load-error'; error = 'Couldn’t load saved review decisions. Retry before changing them.'; }
        }
        publish(); scheduleSource();
    }
    async function persist(command) {
        if (disposed || ['loading', 'load-error', 'saving'].includes(status)) throw new Error('Wait for saved review decisions to become available.');
        if (pending && command !== pending) throw new Error('Retry the previous review decision first.');
        pending = command; status = 'saving'; error = ''; publish();
        try {
            const value = await change(command);
            if (disposed) return;
            await flushSource();
            if (disposed) return;
            for (const anchor of command.anchors || []) {
                if (JSON.stringify(anchors.get(anchor.id)) === JSON.stringify(anchor)) anchors.delete(anchor.id);
            }
            for (const id of anchors.keys()) if (!value.some(item => item.id === id)) anchors.delete(id);
            decisions = value.map(item => anchors.get(item.id) || item); pending = undefined; status = 'saved';
            if (source !== undefined && !edits.length) edits.push({ next: source });
            await flushSource();
            publish(); scheduleAnchors();
            // An add is not finished until edits made during its storage round
            // trip have a durable anchor too. Keep retries on the original add.
            if (command.action === 'add' && anchors.size) await flushAnchors();
        } catch (cause) {
            const rejection = writingDecisionFailure(cause);
            status = rejection ? 'save-rejected' : 'save-error';
            if (rejection) { if (command.action === 'add') anchors.delete(command.decision.id); pending = undefined; }
            error = rejection || 'Couldn’t confirm this review decision was saved. Retry, or reload saved decisions before continuing.'; publish();
            throw new Error(error, { cause });
        }
    }
    const flushAnchors = async () => {
        await flushSource();
        if (disposed || pending || !['saved', 'save-rejected'].includes(status) || !anchors.size) return;
        await persist({ action: 'reanchor', anchors: [...anchors.values()] });
    };
    return { snapshot, restore, change: persist, reconcile: restore, flushAnchors, flushSource, observeSource,
        retry: async () => {
            if (status === 'load-error') return restore();
            if (trackingError) await flushSource();
            return pending ? persist(pending) : undefined;
        },
        destroy() { disposed = true; unschedule?.(timer); unschedule?.(sourceTimer); edits.length = 0; },
    };
}
