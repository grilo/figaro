import { mountFloatingMenu } from '../floatingMenu.js';
import { createWritingExampleList } from './writingExamplesView.js';

/** A nonmodal, persistent help surface using the existing menu and icon button. */
export function createWritingLensHelpView({ id }) {
    const element = document.createElement('section');
    element.id = id; element.className = 'ui-menu writing-lens-help';
    element.hidden = true;
    element.setAttribute('role', 'dialog'); element.setAttribute('aria-labelledby', `${id}-title`);
    const header = document.createElement('div'); header.className = 'writing-lenses-quick-header';
    const title = document.createElement('strong'); title.id = `${id}-title`;
    const dismiss = document.createElement('button'); dismiss.type = 'button';
    dismiss.className = 'ui-icon-button'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label', 'Close lens help');
    const content = document.createElement('div'); content.className = 'writing-lens-help-content';
    header.append(title, dismiss); element.append(header, content);
    let anchor, placement, contentKey;
    function close({ restoreFocus = false } = {}) {
        if (!anchor) return;
        const opener = anchor;
        anchor = null; opener.setAttribute('aria-expanded', 'false');
        element.hidden = true; placement?.close(); placement = null;
        document.removeEventListener('pointerdown', onOutside);
        document.removeEventListener('focusin', onFocus);
        document.removeEventListener('keydown', onKey, true);
        if (restoreFocus && opener.isConnected && !opener.closest('[inert], [hidden]')) opener.focus();
    }
    function onOutside(event) {
        if (!element.contains(event.target) && !anchor?.contains(event.target)) close();
    }
    function onFocus(event) {
        if (!element.contains(event.target) && !anchor?.contains(event.target)) close();
    }
    function onKey(event) {
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); close({ restoreFocus: true });
        } else if (event.key === 'Tab' && (event.shiftKey || event.target === dismiss)) {
            // Resume the invoking row's native tab order, rather than the body's portal order.
            close({ restoreFocus: true });
        }
    }
    function update(value) {
        const key = JSON.stringify(value);
        if (key === contentKey) return;
        contentKey = key; title.textContent = value.title;
        const paragraph = (text, className = '') => {
            const node = document.createElement('p'); node.textContent = text; node.className = className; node.hidden = !text; return node;
        };
        const limits = document.createElement('section');
        const heading = document.createElement('strong'); heading.textContent = 'Keep in mind';
        limits.append(heading, paragraph(value.limits));
        content.replaceChildren(paragraph(value.reason, 'ui-notice'), paragraph(value.detail), paragraph(value.coverage));
        if (value.examples.length) content.append(paragraph(value.exampleNote, 'writing-lenses-description'), createWritingExampleList(value.examples));
        content.append(limits); placement?.position();
    }
    dismiss.addEventListener('click', () => close({ restoreFocus: true }));
    return {
        element, close, update,
        get opener() { return anchor; },
        toggle(opener, value) {
            if (opener === anchor) { close({ restoreFocus: true }); return; }
            close(); update(value); anchor = opener;
            element.hidden = false; opener.setAttribute('aria-expanded', 'true');
            placement = mountFloatingMenu(opener, element, { maximumWidth: 360, maximumHeight: 620, preferredPlacement: 'left' });
            document.addEventListener('pointerdown', onOutside);
            document.addEventListener('focusin', onFocus);
            document.addEventListener('keydown', onKey, true);
            element.scrollTop = 0;
            dismiss.focus({ preventScroll: true });
        },
        destroy() { close(); element.remove(); },
    };
}
