import { resolveWritingReview, trackWritingDecisions } from '../../../frontend/js/core/writingReviewWork.js';

// Pure implementations injected into use-case/component tests. Production
// composition supplies eagerly initialized workers, covered by adapter tests.
export const writingTestPorts = {
    destroy() {},
    review: { resolve: async input => resolveWritingReview(input), cancel() {} },
    trackDecisions: async input => trackWritingDecisions(input),
};
