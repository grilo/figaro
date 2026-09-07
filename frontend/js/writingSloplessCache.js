import { createWritingTokenCache } from './core/writingTokenCache.js';

// The vendor adapter supplies the pinned tokenizer. Only this worker-local
// cache is shared by rules; no source or token arrays survive an analysis.
export const writingSloplessCache = createWritingTokenCache();
