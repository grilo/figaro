/** Serialize path mutations against storage, without suspending editor input.
 * Queued writes resolve the entry's current path only after relocation finishes.
 */
export function createWritingPathContinuity({ remap }) {
    const active = new Set();
    let barrier, mutations = Promise.resolve();
    async function access(entry, operation) {
        while (barrier) await barrier;
        const pending = Promise.resolve(operation(entry.path));
        active.add(pending);
        try { return await pending; } finally { active.delete(pending); }
    }
    function move(operation) {
        const pending = mutations.then(async () => {
            let release;
            barrier = new Promise(resolve => { release = resolve; });
            try {
                await Promise.allSettled([...active]);
                const result = await operation();
                if (result?.success) remap(result);
                return result;
            } finally { barrier = undefined; release(); }
        });
        mutations = pending.catch(() => {});
        return pending;
    }
    return { access, move };
}
