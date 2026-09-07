import { trackWritingDecisions } from './core/writingReviewWork.js';

self.onmessage = ({ data }) => {
    try { self.postMessage({ id: data.id, result: trackWritingDecisions(data.source) }); }
    catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
self.postMessage({ ready: true });
