import { resolveWritingReview } from '../core/writingReviewWork.js';

/** Worker-local prose cache; analysis is supplied by the eager runtime adapter. */
export function createWritingProse({ analyze }) {
    let cachedSource, cached;
    async function prose(source, options) {
        if (cachedSource !== source || !cached) {
            const value = await analyze(source, options);
            cached = value; cachedSource = source;
        }
        return cached;
    }
    return {
        async analyze(source, options) {
            const value = await prose(source, options);
            // Keep raw observations and source maps inside the worker.
            return { projection: { text: value.projection.text }, observations: [] };
        },
        async resolve(input, options) {
            // A later spelling/Vale result may reach a replacement worker.
            // Recover required prose before reporting a complete review.
            let value, proseFailure;
            try { if (input.proseRequired) value = await prose(input.job.source, options); }
            catch (error) {
                if (/cancelled/i.test(error.message)) throw error;
                proseFailure = /timed out/i.test(error.message) ? 'timed out' : 'failed';
            }
            await options?.checkpoint?.();
            return { ...resolveWritingReview({ ...input,
                projection: value?.projection, observations: value?.observations || [],
                valeOutput: value ? input.valeOutput : undefined }), proseFailure };
        },
    };
}
