import {
    blockControlActivationRect,
    blockControlShouldReveal,
} from './core/blockControlVisibilityModel.js';

const controlSelector = '.ui-editor-block-guide[data-fold-from][data-fold-to]';

function numericDataset(control, name, documentLength) {
    const value = Number(control.dataset[name]);
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.min(value, documentLength));
}

function blockRectFor(view, control, ownerRect) {
    const length = view.state.doc.length;
    const from = numericDataset(control, 'relevanceFrom', length);
    const to = numericDataset(control, 'relevanceTo', length);
    if (from == null || to == null) return ownerRect;
    const start = view.coordsAtPos(from, 1);
    const end = view.coordsAtPos(to, -1);
    return {
        top: Math.min(ownerRect.top, start?.top ?? ownerRect.top),
        bottom: Math.max(ownerRect.bottom, end?.bottom ?? ownerRect.bottom),
    };
}

function readVisibility(view, pointer) {
    const contentRect = view.contentDOM.getBoundingClientRect();
    const selection = view.state.selection.main;
    return [...view.dom.querySelectorAll(controlSelector)].map(control => {
        const owner = control.closest('.cm-gutterElement');
        if (!owner) return null;
        const ownerRect = owner.getBoundingClientRect();
        const blockRect = blockRectFor(view, control, ownerRect);
        const from = numericDataset(control, 'relevanceFrom', view.state.doc.length);
        const to = numericDataset(control, 'relevanceTo', view.state.doc.length);
        const activationRect = blockControlActivationRect({
            controlRect: ownerRect,
            contentRect,
            blockRect,
            heading: control.dataset.guideType === 'heading',
        });
        return {
            owner,
            reveal: blockControlShouldReveal({
                folded: control.getAttribute('aria-expanded') === 'false',
                focused: owner.contains(document.activeElement),
                caretInside: view.hasFocus && from != null && to != null
                    && selection.head >= from && selection.head <= to,
                pointer,
                activationRect,
            }),
        };
    }).filter(Boolean);
}

/** Keep pointer geometry in a DOM adapter; the reveal policy remains pure. */
export function createBlockControlVisibilityExtension(ViewPlugin) {
    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.view = view;
            this.pointer = null;
            this.handlePointerMove = event => {
                this.pointer = { x: event.clientX, y: event.clientY };
                this.schedule();
            };
            this.handlePointerLeave = () => {
                this.pointer = null;
                this.schedule();
            };
            this.handleFocusChange = () => this.schedule();
            view.dom.addEventListener('pointermove', this.handlePointerMove);
            view.dom.addEventListener('pointerleave', this.handlePointerLeave);
            view.dom.addEventListener('focusin', this.handleFocusChange);
            view.dom.addEventListener('focusout', this.handleFocusChange);
            this.schedule();
        }

        schedule() {
            this.view.requestMeasure({
                key: this,
                read: view => readVisibility(view, this.pointer),
                write: measurements => {
                    for (const { owner, reveal } of measurements) {
                        owner.classList.toggle('is-block-control-relevant', reveal);
                    }
                },
            });
        }

        update(update) {
            if (update.docChanged || update.selectionSet || update.viewportChanged
                || update.geometryChanged) this.schedule();
        }

        destroy() {
            this.view.dom.removeEventListener('pointermove', this.handlePointerMove);
            this.view.dom.removeEventListener('pointerleave', this.handlePointerLeave);
            this.view.dom.removeEventListener('focusin', this.handleFocusChange);
            this.view.dom.removeEventListener('focusout', this.handleFocusChange);
        }
    });
}
