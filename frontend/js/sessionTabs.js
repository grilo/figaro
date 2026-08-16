/**
 * Compatibility exports for callers that have not yet moved to the core
 * namespace. The implementation lives with the pure session model.
 */
export {
    restoreSessionTabs,
    restoredTabOpenArgs,
    restoredWorkspacePlan,
    serializeSessionTabs,
} from './core/sessionModel.js';
