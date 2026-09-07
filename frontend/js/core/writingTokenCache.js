/** Bounded, analysis-scoped memoization of the package's unchanged tokenizer.
 * Return copies: a rule must never mutate another rule's token stream.
 */
export function createWritingTokenCache({ maximumEntries = 4096, maximumWeight = 2 * 1024 * 1024 } = {}) {
    const entries = new Map();
    let weight = 0;
    return {
        clear() { entries.clear(); weight = 0; },
        tokens(text, tokenize) {
            let entry = entries.get(text);
            if (entry) {
                entries.delete(text); entries.set(text, entry);
            } else {
                const tokens = tokenize(text);
                const size = text.length * 2 + tokens.reduce((sum, token) => sum + 64 + 2 * (token.text.length + token.normalized.length), 0);
                entry = { tokens, size };
                if (size <= maximumWeight && maximumEntries > 0) {
                    while (entries.size && (entries.size >= maximumEntries || weight + size > maximumWeight)) {
                        const oldest = entries.keys().next().value;
                        weight -= entries.get(oldest).size; entries.delete(oldest);
                    }
                    entries.set(text, entry); weight += size;
                }
            }
            return entry.tokens.map(token => ({ ...token }));
        },
    };
}
