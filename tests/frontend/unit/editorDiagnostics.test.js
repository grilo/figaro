import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editorDiagnostics, editorInputTrace, countEditorWork, deferEditorWork } from '../../../frontend/js/editorDiagnostics.js';

test.each([false, true])('input tracing preserves delivery and ends after handlers (stopped propagation: %s)', async stopPropagation => {
    let handlerCause;
    let deferred;
    let calls = 0;
    const view = new EditorView({ parent: document.body, state: EditorState.create({ doc: 'secret note', extensions: [
        editorInputTrace,
        EditorView.domEventHandlers({ keydown(event) {
            handlerCause = editorDiagnostics.capture(); calls++;
            countEditorWork('handler');
            deferred = deferEditorWork('viewport', 'navigation', () => countEditorWork('geometry.cursor'), 'frame');
            if (stopPropagation) event.stopPropagation();
            return false;
        } }),
    ] }) });
    editorDiagnostics.start();
    try {
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
        view.contentDOM.dispatchEvent(event);
        expect(calls).toBe(1); expect(handlerCause).not.toBeNull();
        expect(event.defaultPrevented).toBe(false);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(editorDiagnostics.capture()).toBeNull();
        deferred();
        const records = editorDiagnostics.snapshot();
        expect(records).toHaveLength(1);
        expect(records[0].counters).toEqual({ handler: 1, 'geometry.cursor': 1 });
        expect(records[0].work[0].phase).toBe('frame');
        expect(JSON.stringify(records)).not.toContain('secret note');
        expect(JSON.stringify(records)).not.toContain('ArrowDown');
    } finally { view.destroy(); editorDiagnostics.stop(); }
});
