/** Persist changes before making them effective; serialize concurrent words. */
export function createSpellingDictionary({ load, add, remove, onChange = () => {} }) {
    const listeners = new Set();
    let words = [], ready = null, queue = Promise.resolve();
    function accept(value) {
        if (!Array.isArray(value) || value.some(word => typeof word !== 'string')) throw new Error('Invalid spelling dictionary');
        words = value.slice(); onChange(words.slice());
        for (const listener of listeners) listener(words.slice());
        return words.slice();
    }
    const restore = () => ready ||= load().then(accept).catch(error => { ready = null; throw error; });
    function change(port, word) {
        const attempt = queue.then(async () => {
            await restore();
            return accept(await port(word));
        });
        queue = attempt.catch(() => {});
        return attempt;
    }
    return {
        restore,
        words: () => words.slice(),
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        add: word => change(add, word),
        remove: word => change(remove, word),
    };
}
