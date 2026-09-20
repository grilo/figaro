import { ViewPlugin } from '@codemirror/view';
import { createInteractionTrace } from './usecases/interactionTrace.js';

// Disabled by default, including in production. Enable explicitly in developer tools.
export const editorDiagnostics = createInteractionTrace({ now: () => performance.now() });
export const countEditorWork = editorDiagnostics.count;
export const traceEditorWork = editorDiagnostics.run;
export const deferEditorWork = editorDiagnostics.deferred;
export function readEditorDocument(document, consumer) {
    countEditorWork('document.materialize');
    return traceEditorWork(consumer, 'full document read', () => document.toString());
}

/** Capture causes before CodeMirror handles input, without consuming any event. */
export const editorInputTrace = ViewPlugin.fromClass(class {
    constructor(view) {
        this.dom = view.dom;
        this.finish = null;
        this.capture = event => {
            if (!editorDiagnostics.enabled()) return;
            this.finish?.();
            // Never record key text, input data, document IDs, paths, or source.
            const reason = event.type === 'keydown'
                ? (/^(?:Arrow|Page|Home$|End$)/u.test(event.key) ? 'navigation' : 'key')
                : event.type;
            const end = editorDiagnostics.begin('input', [reason]);
            // WebKit may drain microtasks between native event listeners. End
            // on the bubbling boundary, with a task fallback if propagation
            // stops, so the actual CodeMirror handler retains its cause.
            const finish = () => {
                clearTimeout(timer);
                end();
                if (this.finish === finish) this.finish = null;
            };
            this.finish = finish;
            const timer = setTimeout(finish, 0);
        };
        this.events = ['keydown', 'beforeinput', 'pointerdown', 'pointerup'];
        this.release = () => this.finish?.();
        for (const event of this.events) {
            this.dom.addEventListener(event, this.capture, true);
            this.dom.addEventListener(event, this.release);
        }
    }
    destroy() {
        this.finish?.();
        for (const event of this.events) {
            this.dom.removeEventListener(event, this.capture, true);
            this.dom.removeEventListener(event, this.release);
        }
    }
});
