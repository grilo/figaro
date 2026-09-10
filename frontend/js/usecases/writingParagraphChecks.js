/** Reuse only exact paragraph inputs. The adapter supplies pinned package work
 * and cooperative yielding; offsets and document-wide policy are applied later.
 */
export function createWritingParagraphChecks({ analyze, maximumEntries = 2048, maximumWeight = 4 * 1024 * 1024 }) {
    const entries = new Map();
    let weight = 0, hits = 0, scans = 0, batches = 0;
    function retain(text, value) {
        const size = text.length * 2 + JSON.stringify(value).length * 2;
        if (size > maximumWeight || maximumEntries <= 0) return;
        while (entries.size && (entries.size >= maximumEntries || weight + size > maximumWeight)) {
            const key = entries.keys().next().value;
            weight -= entries.get(key).size; entries.delete(key);
        }
        entries.set(text, { value, size }); weight += size;
    }
    return {
        async check(text, checkpoint = async () => {}) {
            await checkpoint();
            const entry = entries.get(text);
            if (entry) {
                hits++;
                entries.delete(text); entries.set(text, entry);
                return entry.value;
            }
            scans++; batches++;
            const value = await analyze(text);
            retain(text, value);
            return value;
        },
        async checkMany(chunks, checkpoint, split) {
            const values = new Map(), missing = [];
            for (const { text } of chunks) {
                if (values.has(text)) { hits++; continue; }
                const entry = entries.get(text);
                if (entry) {
                    hits++; entries.delete(text); entries.set(text, entry); values.set(text, entry.value);
                } else { values.set(text, undefined); missing.push(text); }
            }
            // Amortize package setup on cold notes/pastes. Batches are bounded,
            // giving cancellation an opportunity between groups of paragraphs.
            for (let at = 0; at < missing.length;) {
                await checkpoint();
                const group = []; let text = '', line = 1;
                do {
                    const part = missing[at++];
                    group.push({ text: part, from: text.length, line });
                    text += part; line += part.split('\n').length - 1;
                } while (at < missing.length && group.length < 64 && text.length < 16384);
                batches++; scans += group.length;
                const result = await analyze(text);
                for (const chunk of group) {
                    const value = split(result, chunk);
                    values.set(chunk.text, value); retain(chunk.text, value);
                }
            }
            return chunks.map(chunk => values.get(chunk.text));
        },
        stats: () => ({ hits, scans, batches, entries: entries.size, weight }),
        clear() { entries.clear(); weight = 0; },
    };
}
