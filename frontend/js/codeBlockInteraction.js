import { ViewPlugin } from '@codemirror/view';
import { codeBlockScrollbarAxis } from './core/codeBlockInteractionModel.js';

function borderWidths(element) {
    const style = getComputedStyle(element);
    return {
        borderTop: Number.parseFloat(style.borderTopWidth) || 0,
        borderRight: Number.parseFloat(style.borderRightWidth) || 0,
        borderBottom: Number.parseFloat(style.borderBottomWidth) || 0,
        borderLeft: Number.parseFloat(style.borderLeftWidth) || 0,
    };
}

function scrollbarAxisForWidget(widget, { clientX, clientY } = {}) {
    return codeBlockScrollbarAxis({
        clientX,
        clientY,
        rect: widget.getBoundingClientRect(),
        clientWidth: widget.clientWidth,
        clientHeight: widget.clientHeight,
        offsetWidth: widget.offsetWidth,
        offsetHeight: widget.offsetHeight,
        scrollWidth: widget.scrollWidth,
        scrollHeight: widget.scrollHeight,
        ...borderWidths(widget),
    });
}

/** Let the code widget ask Figaro whether a pointer press belongs to a scrollbar. */
export const codeBlockScrollbarGuardExtension = ViewPlugin.fromClass(class {
    constructor(view) {
        this.view = view;
        this.selectionRestoreTimer = null;
        this.pendingSelection = null;
        this.activeScrollbarSelection = null;
        this.captureSelection = event => {
            this.pendingSelection = null;
            if (event.target?.closest?.('.cm-codeblock-copy')) return;
            const widget = event.target?.closest?.('.cm-codeblock-widget.cm-source-footprint--scroll');
            if (!widget || !view.dom.contains(widget)) return;
            if (!scrollbarAxisForWidget(widget, event)) return;
            this.pendingSelection = {
                document: view.state.doc,
                selection: view.state.selection,
            };
        };
        this.handlePointerIntent = event => {
            const widget = event.target?.closest?.('.cm-codeblock-widget.cm-source-footprint--scroll');
            if (!widget) return;
            const axis = scrollbarAxisForWidget(widget, event.detail);
            if (axis) {
                const captured = this.pendingSelection;
                this.pendingSelection = null;
                const documentBefore = captured?.document === view.state.doc
                    ? captured.document
                    : view.state.doc;
                const selectionBefore = captured?.document === view.state.doc
                    ? captured.selection
                    : view.state.selection;
                this.activeScrollbarSelection = {
                    document: documentBefore,
                    selection: selectionBefore,
                };
                event.preventDefault();
            }
        };
        this.finishScrollbarPress = () => {
            this.pendingSelection = null;
            const captured = this.activeScrollbarSelection;
            this.activeScrollbarSelection = null;
            if (!captured) return;
            clearTimeout(this.selectionRestoreTimer);
            this.selectionRestoreTimer = setTimeout(() => {
                this.selectionRestoreTimer = null;
                if (
                    !view.isDestroyed
                    && view.state.doc === captured.document
                    && !captured.selection.eq(view.state.selection)
                ) view.dispatch({ selection: captured.selection });
            }, 0);
        };
        document.addEventListener('mousedown', this.captureSelection, true);
        document.addEventListener('mouseup', this.finishScrollbarPress, true);
        document.addEventListener('pointercancel', this.finishScrollbarPress, true);
        view.dom.addEventListener('codeblock-pointer-intent', this.handlePointerIntent);
    }

    destroy() {
        clearTimeout(this.selectionRestoreTimer);
        document.removeEventListener('mousedown', this.captureSelection, true);
        document.removeEventListener('mouseup', this.finishScrollbarPress, true);
        document.removeEventListener('pointercancel', this.finishScrollbarPress, true);
        this.view.dom.removeEventListener('codeblock-pointer-intent', this.handlePointerIntent);
    }
});
