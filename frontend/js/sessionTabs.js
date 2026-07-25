/**
 * Compatibility exports for callers that have not yet moved to the core
 * namespace. The implementation lives with the pure session model.
 */
export {
    restoreSessionTabs,
    restoredTabOpenArgs,
    serializeSessionTabs,
} from './core/sessionModel.js';
