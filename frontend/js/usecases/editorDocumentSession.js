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
    applyContent,
    restoreSelection,
    reportFailure = () => {},
}) {
    let pendingRequest = null;
    let documentTabId = null;

    function mount(content, requestedTabId = undefined, cursorState = null) {
        if (typeof content !== 'string') return false;
        const request = {
            content,
            tabId: requestedTabId === undefined ? documentTabId : requestedTabId,
            cursorState,
        };
        pendingRequest = request;
        const editor = readEditor();
        if (editorUnavailable(editor)) return true;

        schedule(() => {
            if (editorUnavailable(editor) || pendingRequest !== request) return;
            if (request.tabId != null && readActiveTabId() !== request.tabId) return;
            if (readContent(editor) === request.content) {
                documentTabId = request.tabId;
                if (request.cursorState) restoreSelection(request.tabId, request.cursorState);
                return;
            }
            try {
                beforeReplace();
                documentTabId = request.tabId;
                applyContent(editor, request);
            } catch (error) {
                reportFailure(error);
            }
        });
        return true;
    }

    return {
        mount,
        documentTabId: () => documentTabId,
    };
}
