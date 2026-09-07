/** Coordinate saved-history reads and off-thread projection through injected ports. */
export function createActivityReview({ load, project, cancel, schedule, unschedule, readSource, publish, timeZone }) {
    let ownerDocument = null, generation = 0, loadRevision = 0, timer = null;
    let recorded = null, loading = false, reload = false, disposed = false;
    function clearTimer() { if (timer !== null) unschedule(timer); timer = null; }
    function emit(value) { if (ownerDocument && !disposed) publish({ ...value, key: ownerDocument.key, path: ownerDocument.path }); }
    function queueProjection() {
        clearTimer();
        if (!ownerDocument || !recorded || disposed) return;
        const ticket = generation;
        timer = schedule(async () => {
            timer = null;
            const owner = ownerDocument;
            const source = readSource(owner.key);
            if (source === null || ticket !== generation || disposed) return;
            try {
                const projection = await project({ source, recorded, timeZone });
                if (ticket !== generation || ownerDocument !== owner || disposed) return;
                emit({ status: 'ready', projection, source });
            } catch (error) {
                if (ticket === generation && ownerDocument === owner && !disposed) emit({ status: 'error', error: String(error?.message || error) });
            }
        }, 180);
    }
    async function readHistory() {
        if (loading) { reload = true; return; }
        if (!ownerDocument || disposed) return;
        loading = true; reload = false;
        const owner = ownerDocument, ticket = loadRevision;
        try {
            const result = await load(owner.path);
            if (ownerDocument !== owner || ticket !== loadRevision || disposed) return;
            recorded = result; queueProjection();
        } catch (error) {
            if (ownerDocument === owner && ticket === loadRevision && !disposed) emit({ status: 'error', error: String(error?.message || error) });
        } finally {
            loading = false;
            if (reload && !disposed) readHistory();
        }
    }
    return {
        select(next) {
            generation++; loadRevision++; clearTimer(); cancel(); recorded = null;
            ownerDocument = next;
            if (ownerDocument) { emit({ status: 'loading' }); readHistory(); }
        },
        changed() { generation++; cancel(); queueProjection(); },
        refresh() { generation++; loadRevision++; cancel(); clearTimer(); if (ownerDocument) readHistory(); },
        retry() { generation++; loadRevision++; cancel(); clearTimer(); emit({ status: 'loading' }); readHistory(); },
        destroy() { disposed = true; generation++; loadRevision++; clearTimer(); cancel(); ownerDocument = null; },
    };
}
