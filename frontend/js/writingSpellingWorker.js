import { spellingWordSuggestions, writingSpellingObservations } from './spellcheck.js';
import { createWritingWorkerCheckpoint } from './writingWorkerCheckpoint.js';

const suggestions = new Map();
let cancelledThrough = 0;
self.onmessage = async ({ data }) => {
    if (data.cancel !== undefined) { cancelledThrough = Math.max(cancelledThrough, data.cancel); return; }
    // A right-click asks about one word between the review's checkpoints and
    // shares its dictionaries and suggestion cache.
    if (data.lookupId !== undefined) {
        try { self.postMessage({ lookupId: data.lookupId, result: await spellingWordSuggestions(data.lookup, undefined, suggestions) }); }
        catch (error) { self.postMessage({ lookupId: data.lookupId, error: error.message }); }
        return;
    }
    const checkpoint = createWritingWorkerCheckpoint(() => data.id <= cancelledThrough);
    try {
        const result = await writingSpellingObservations(data.source, data.language, undefined, { suggestions, checkpoint });
        await checkpoint();
        self.postMessage({ id: data.id, result });
    }
    catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
self.postMessage({ ready: true });
