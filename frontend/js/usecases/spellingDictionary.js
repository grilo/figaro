/** Persist additions before making them effective; serialize concurrent words. */
export function createSpellingDictionary({ load, add, onChange = () => {} }) {
    let words = [], ready = null, queue = Promise.resolve();
    function accept(value) {
        if (!Array.isArray(value) || value.some(word => typeof word !== 'string')) throw new Error('Invalid spelling dictionary');
        words = value.slice(); onChange(words); return words;
    }
    const restore = () => ready ||= load().then(accept).catch(error => { ready = null; throw error; });
    return {
        restore,
        words: () => words.slice(),
        add(word) {
            const attempt = queue.then(async () => {
                await restore();
                const next = await add(word);
                return accept(next);
            });
            queue = attempt.catch(() => {});
            return attempt;
        },
    };
}
