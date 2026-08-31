import { ACCENT_COLOR_PALETTE } from './colorPalette.js';
import { planFloatingMenuPlacement } from './core/floatingMenuModel.js';

let activePicker = null;
let pickerSequence = 0;

/** Open the same theme-aware palette used by Kanban beside an anchor button. */
export function openColorPalettePicker(anchor, {
    currentColor = '',
    emptyLabel = 'No color',
    includeEmpty = true,
    label = 'Choose color',
    onSelect = () => {},
} = {}) {
    activePicker?.close();
    if (!anchor?.isConnected) return null;

    const picker = document.createElement('div');
    picker.className = 'kanban-color-picker';
    picker.id = `color-palette-picker-${++pickerSequence}`;
    picker.setAttribute('role', 'listbox');
    picker.setAttribute('aria-label', label);
    anchor.setAttribute('aria-controls', picker.id);
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-haspopup', 'listbox');
    const colors = includeEmpty
        ? ACCENT_COLOR_PALETTE
        : ACCENT_COLOR_PALETTE.filter(Boolean);
    for (const color of colors) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = `kanban-color-swatch${color === currentColor ? ' active' : ''}`;
        swatch.dataset.color = color;
        swatch.setAttribute('role', 'option');
        swatch.setAttribute('aria-selected', String(color === currentColor));
        swatch.setAttribute('aria-label', color ? `Color ${color}` : emptyLabel);
        swatch.title = color || emptyLabel;
        if (color) swatch.style.background = color;
        else swatch.textContent = '✕';
        picker.append(swatch);
    }
    document.body.append(picker);

    const anchorBounds = anchor.getBoundingClientRect();
    const pickerBounds = picker.getBoundingClientRect();
    const placement = planFloatingMenuPlacement({
        trigger: anchorBounds,
        menuWidth: pickerBounds.width || 210,
        menuHeight: pickerBounds.height || 84,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
    });
    picker.style.position = 'fixed';
    picker.style.top = `${placement.top}px`;
    picker.style.left = `${placement.left}px`;
    picker.style.width = `${placement.width}px`;
    picker.style.maxHeight = `${placement.maxHeight}px`;
    picker.dataset.placement = placement.placement;

    let closed = false;
    let outsideListenerTimer = 0;
    const close = ({ restoreFocus = false } = {}) => {
        if (closed) return;
        closed = true;
        clearTimeout(outsideListenerTimer);
        document.removeEventListener('click', closeOnOutside);
        picker.remove();
        anchor.setAttribute('aria-expanded', 'false');
        anchor.removeAttribute('aria-controls');
        if (activePicker?.picker === picker) activePicker = null;
        if (restoreFocus && anchor.isConnected) anchor.focus();
    };
    const choose = event => {
        const swatch = event.target.closest('.kanban-color-swatch');
        if (!swatch) return;
        const color = swatch.dataset.color;
        close({ restoreFocus: true });
        void Promise.resolve(onSelect(color));
    };
    const closeOnOutside = event => {
        if (!picker.contains(event.target) && event.target !== anchor) close();
    };
    picker.addEventListener('click', choose);
    picker.addEventListener('keydown', event => {
        const swatches = Array.from(picker.querySelectorAll('.kanban-color-swatch'));
        const index = swatches.indexOf(document.activeElement);
        if (event.key === 'Escape') {
            event.preventDefault();
            close({ restoreFocus: true });
        } else if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
            swatches[(Math.max(0, index) + direction + swatches.length) % swatches.length]?.focus();
        }
    });
    outsideListenerTimer = setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
    activePicker = { picker, close };
    return activePicker;
}

export default openColorPalettePicker;
