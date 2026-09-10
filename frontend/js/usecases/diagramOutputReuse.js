/** Bounded LRU output reuse and in-flight coalescing around an injected renderer. */
export function createDiagramOutputReuse({ render, maxEntries = 64, maxCharacters = 4 * 1024 * 1024 }) {
    const entries = new Map();
    const pending = new Map();
    let characters = 0;
    let generation = 0;
    const remove = key => {
        characters -= key.length + entries.get(key).length;
        entries.delete(key);
    };
    return {
        clear() {
            generation++;
            entries.clear();
            pending.clear();
            characters = 0;
        },
        async render(key, input) {
            if (!key || key.length > maxCharacters || maxEntries < 1) return render(input);
            if (entries.has(key)) {
                const svg = entries.get(key);
                entries.delete(key);
                entries.set(key, svg);
                return svg;
            }
            if (pending.has(key)) return pending.get(key);
            // Bound the number of retained pending keys as well as completed SVGs.
            if (pending.size >= maxEntries) return render(input);
            const epoch = generation;
            const job = Promise.resolve().then(() => render(input)).then(svg => {
                if (epoch !== generation || typeof svg !== 'string' || !svg
                    || key.length + svg.length > maxCharacters) return svg;
                entries.set(key, svg);
                characters += key.length + svg.length;
                while (entries.size > maxEntries || characters > maxCharacters) remove(entries.keys().next().value);
                return svg;
            }).finally(() => {
                if (pending.get(key) === job) pending.delete(key);
            });
            pending.set(key, job);
            return job;
        },
    };
}
