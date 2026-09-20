/** Bound successful/failed parser results and coalesce identical pending parses. */
export function createMermaidValidationReuse(validate, { limit = 128, maxCharacters = 2_000_000 } = {}) {
    const entries = new Map();
    let context, characters = 0;
    return async (source, parserContext) => {
        if (context !== parserContext) {
            entries.clear(); characters = 0; context = parserContext;
        }
        let pending = entries.get(source);
        if (pending) entries.delete(source);
        else {
            pending = Promise.resolve().then(() => validate(source, parserContext))
                .then(result => ({ result }), error => ({ error }));
            characters += source.length;
        }
        entries.set(source, pending);
        while (entries.size > limit || characters > maxCharacters) {
            const oldest = entries.keys().next().value;
            characters -= oldest.length;
            entries.delete(oldest);
        }
        const outcome = await pending;
        if ('error' in outcome) throw outcome.error;
        return outcome.result;
    };
}
