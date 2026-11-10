/**
 * Coordinate ownership of one shared editor across multiple document tabs.
 * Scheduling and editor operations are injected so stale-request behavior can
 * be tested without CodeMirror, the DOM, or timers.
 */
export function createEditorDocumentSession({
    schedule,
    readEditor,
    editorUnavailable,
    readActiveTabId,
    readContent,
    beforeReplace,
    switchDocument,
    applyContent,
    restoreSelection,
    reportFailure = () => {},
}) {
    let pendingRequest = null;
    let documentTabId = null;

    function mount(content, requestedTabId = undefined, cursorState = null) {
        if (typeof content !== 'string') return Promise.resolve(false);
        const tabId = requestedTabId === undefined ? documentTabId : requestedTabId;
        const request = {
            content,
            tabId,
            cursorState,
            documentChanged: tabId !== documentTabId,
            previousTabId: documentTabId,
        };
        pendingRequest = request;
        const editor = readEditor();
        if (editorUnavailable(editor)) return Promise.resolve(false);

        return new Promise(resolve => {
            try {
                schedule(() => {
                    let mounted = false;
                    let previousContent;
                    try {
                        if (editorUnavailable(editor) || pendingRequest !== request) return;
                        if (request.tabId != null && readActiveTabId() !== request.tabId) return;
                        previousContent = readContent(editor);
                        const contentChanged = previousContent !== request.content;
                        if (!request.documentChanged && !contentChanged) {
                            if (request.cursorState) restoreSelection(request.tabId, request.cursorState);
                            mounted = true;
                            return;
                        }
                        beforeReplace();
                        documentTabId = request.tabId;
                        if (request.documentChanged) {
                            switchDocument(editor, request, contentChanged);
                            if (!contentChanged && request.cursorState) {
                                restoreSelection(request.tabId, request.cursorState);
                            }
                        } else if (contentChanged) {
                            applyContent(editor, request);
                        }
                        mounted = true;
                    } catch (error) {
                        // A rejected replacement leaves the previous document
                        // mounted. It stays attributed to its own tab, so the
                        // next edit or save cannot write that text into the
                        // tab whose mount failed.
                        if (request.documentChanged && documentTabId === request.tabId
                            && stillMounted(editor, previousContent)) {
                            documentTabId = request.previousTabId;
                        }
                        reportFailure(error);
                    } finally {
                        resolve(mounted);
                    }
                });
            } catch (error) {
                reportFailure(error);
                resolve(false);
            }
        });
    }

    function stillMounted(editor, content) {
        try {
            return readContent(editor) === content;
        } catch (_) {
            return false;
        }
    }

    /**
     * Follow a tab whose ID changed with its path. The mounted document, its
     * owner and any queued mount keep referring to the same buffer, so edits
     * made after a rename are still recorded against the renamed tab.
     */
    function renameDocumentTab(previousTabId, nextTabId) {
        if (previousTabId == null || nextTabId == null || previousTabId === nextTabId) return false;
        const renamed = documentTabId === previousTabId;
        if (renamed) documentTabId = nextTabId;
        if (pendingRequest?.tabId === previousTabId) pendingRequest.tabId = nextTabId;
        if (pendingRequest?.previousTabId === previousTabId) pendingRequest.previousTabId = nextTabId;
        return renamed;
    }

    return {
        mount,
        renameDocumentTab,
        documentTabId: () => documentTabId,
    };
}
