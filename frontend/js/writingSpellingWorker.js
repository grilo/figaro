import { writingSpellingObservations } from './spellcheck.js';

self.onmessage = async ({ data }) => {
    try { self.postMessage({ id: data.id, result: await writingSpellingObservations(data.source, data.language) }); }
    catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
self.postMessage({ ready: true });
