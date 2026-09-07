import { resolveWritingReview } from '../core/writingReviewWork.js';

/** Worker-local prose cache; analysis is supplied by the eager runtime adapter. */
export function createWritingProse({ analyze }) {
    let cachedSource, cached;
    async function prose(source) {
        if (cachedSource !== source || !cached) {
            const value = await analyze(source);
            cached = value; cachedSource = source;
        }
        return cached;
    }
    return {
        async analyze(source) {
            const value = await prose(source);
            // Keep raw observations and source maps inside the worker.
            return { projection: { text: value.projection.text }, observations: [] };
        },
        async resolve(input) {
            // A later spelling/Vale result may reach a replacement worker.
            // Recover required prose before reporting a complete review.
            let value, proseFailure;
            try { if (input.proseRequired) value = await prose(input.job.source); }
            catch (error) { proseFailure = /timed out/i.test(error.message) ? 'timed out' : 'failed'; }
            return { ...resolveWritingReview({ ...input,
                projection: value?.projection, observations: value?.observations || [],
                valeOutput: value ? input.valeOutput : undefined }), proseFailure };
        },
    };
}
