import { chevronRightIcon } from './icons.js';

/** Shared DOM adapter. CSS owns reversible motion; callers own expansion policy. */
export function createDisclosure({ id, label, content, expanded = false, onChange = () => {} }) {
    const element = document.createElement('div');
    element.className = 'ui-disclosure';
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'ui-disclosure-trigger';
    trigger.setAttribute('aria-label', label);
    trigger.setAttribute('aria-controls', id);
    const chevron = document.createElement('span');
    chevron.className = 'ui-disclosure-chevron'; chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = chevronRightIcon();
    const title = document.createElement('span');
    title.className = 'ui-disclosure-label'; title.textContent = label;
    const summary = document.createElement('span');
    summary.className = 'ui-disclosure-summary'; summary.hidden = true;
    trigger.append(chevron, title, summary);
    const body = document.createElement('div');
    body.id = id; body.className = 'ui-disclosure-body';
    const clip = document.createElement('div');
    clip.className = 'ui-disclosure-content'; clip.append(content);
    body.append(clip); element.append(trigger, body);
    let current, disposed = false;
    function setExpanded(value, { animate = false } = {}) {
        if (disposed || current === Boolean(value)) return;
        current = Boolean(value);
        // Return focus before making the currently focused subtree inert.
        if (!current && body.contains(body.ownerDocument.activeElement)) trigger.focus();
        element.dataset.animate = String(animate);
        element.dataset.expanded = String(current);
        trigger.setAttribute('aria-expanded', String(current));
        body.inert = !current;
        body.setAttribute('aria-hidden', String(!current));
    }
    const toggle = () => {
        if (disposed || trigger.disabled) return;
        setExpanded(!current, { animate: true });
        onChange(current);
    };
    trigger.addEventListener('click', toggle);
    setExpanded(expanded);
    return {
        element, trigger, body, setExpanded,
        setSummary(value) {
            summary.textContent = value; summary.hidden = !value;
            trigger.setAttribute('aria-label', value ? `${label}, ${value}` : label);
        },
        setDisabled(disabled, { busy = false } = {}) {
            trigger.disabled = disabled;
            trigger.setAttribute('aria-busy', String(busy));
        },
        destroy() { disposed = true; trigger.removeEventListener('click', toggle); },
    };
}
