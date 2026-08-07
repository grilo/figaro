/**
 * Build the vault-relative breadcrumb for the active file-backed tab.
 * External launch documents deliberately have no vault-relative hierarchy.
 */
export function editorBreadcrumbModel({ enabled = false, activeTabId = null, openTabs = [] } = {}) {
    if (!enabled || !activeTabId || !Array.isArray(openTabs)) {
        return { visible: false, segments: [] };
    }

    const tab = openTabs.find(candidate => candidate?.id === activeTabId);
    if (!tab || !['file', 'drawio'].includes(tab.type) || !tab.path || tab.externalFileId) {
        return { visible: false, segments: [] };
    }

    const segments = String(tab.path)
        .replaceAll('\\', '/')
        .split('/')
        .filter(segment => segment && segment !== '.');

    return {
        visible: segments.length > 0,
        segments,
    };
}
