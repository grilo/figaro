/** Bounded preview data. Callers supply weight and own any browser resources. */
export function createPreviewCache({ maximumEntries, maximumWeight }) {
    const entries = new Map();
    let weight = 0;
    const remove = key => {
        const entry = entries.get(key);
        if (!entry) return;
        weight -= entry.weight;
        entries.delete(key);
        return entry.value;
    };
    return {
        get(key) {
            const entry = entries.get(key);
            if (!entry) return;
            entries.delete(key);
            entries.set(key, entry);
            return entry.value;
        },
        take: remove,
        set(key, value, entryWeight) {
            remove(key);
            if (!Number.isFinite(entryWeight) || entryWeight < 0
                || entryWeight > maximumWeight || maximumEntries < 1) return false;
            while (entries.size && (entries.size >= maximumEntries || weight + entryWeight > maximumWeight)) {
                remove(entries.keys().next().value);
            }
            entries.set(key, { value, weight: entryWeight });
            weight += entryWeight;
            return true;
        },
        clear() { entries.clear(); weight = 0; },
        stats: () => ({ entries: entries.size, weight }),
    };
}
