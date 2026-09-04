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
                    try {
                        if (editorUnavailable(editor) || pendingRequest !== request) return;
                        if (request.tabId != null && readActiveTabId() !== request.tabId) return;
                        const contentChanged = readContent(editor) !== request.content;
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

    return {
        mount,
        documentTabId: () => documentTabId,
    };
}
