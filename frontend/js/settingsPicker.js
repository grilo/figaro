import { pickerKeyboardPlan } from './core/pickerModel.js';

let pickerSequence = 0;

function normalizedOptions(options) {
    return (Array.isArray(options) ? options : [])
        .map(option => ({
            value: String(option?.value ?? option?.id ?? ''),
            label: String(option?.label ?? option?.name ?? option?.value ?? option?.id ?? ''),
        }))
        .filter(option => option.value);
}

/**
 * Give an approved `.ui-picker` trigger/menu pair one select-only combobox
 * contract. Focus remains on the trigger while aria-activedescendant exposes
 * the active option to assistive technology.
 */
export function enhanceSettingsPicker({
    trigger,
    menu,
    options,
    value,
    ariaLabel,
    optionClass = '',
    onChange = () => {},
} = {}) {
    if (!trigger || !menu) return null;
    trigger._figaroSettingsPicker?.destroy?.();

    const records = normalizedOptions(options);
    const sequence = ++pickerSequence;
    const baseId = menu.id || `settings-picker-${sequence}-menu`;
    const label = trigger.querySelector('[data-picker-value]') || trigger.querySelector('span');
    let selectedValue = records.some(option => option.value === String(value))
        ? String(value)
        : records[0]?.value || '';
    let activeIndex = Math.max(0, records.findIndex(option => option.value === selectedValue));
    let open = false;

    trigger.type = 'button';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-controls', baseId);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', ariaLabel || trigger.getAttribute('aria-label') || 'Choose option');
    trigger.querySelectorAll('svg').forEach(icon => icon.setAttribute('aria-hidden', 'true'));
    menu.id = baseId;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', `${trigger.getAttribute('aria-label')} options`);

    const fragment = document.createDocumentFragment();
    const optionButtons = records.map((record, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = `${baseId}-option-${index}`;
        button.className = `ui-menu-item settings-picker-item ${optionClass}`.trim();
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', 'false');
        button.tabIndex = -1;
        button.dataset.value = record.value;
        button.dataset.id = record.value;
        const text = document.createElement('span');
        text.textContent = record.label;
        const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        check.setAttribute('width', '13');
        check.setAttribute('height', '13');
        check.setAttribute('viewBox', '0 0 24 24');
        check.setAttribute('fill', 'none');
        check.setAttribute('stroke', 'currentColor');
        check.setAttribute('stroke-width', '2.5');
        check.setAttribute('aria-hidden', 'true');
        check.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
        button.append(text, check);
        fragment.append(button);
        return button;
    });
    menu.replaceChildren(fragment);

    const sync = () => {
        const selectedIndex = Math.max(0, records.findIndex(option => option.value === selectedValue));
        const selected = records[selectedIndex];
        if (label) label.textContent = selected?.label || '';
        optionButtons.forEach((button, index) => {
            const isSelected = index === selectedIndex;
            button.classList.toggle('selected', isSelected);
            button.setAttribute('aria-selected', String(isSelected));
        });
    };
    const setActive = index => {
        if (!optionButtons.length) {
            activeIndex = -1;
            trigger.removeAttribute('aria-activedescendant');
            return;
        }
        activeIndex = (index + optionButtons.length) % optionButtons.length;
        optionButtons.forEach((button, buttonIndex) => {
            button.classList.toggle('active', buttonIndex === activeIndex);
        });
        trigger.setAttribute('aria-activedescendant', optionButtons[activeIndex].id);
        optionButtons[activeIndex].scrollIntoView?.({ block: 'nearest' });
    };
    const setOpen = requested => {
        open = Boolean(requested && optionButtons.length && !trigger.disabled);
        trigger.setAttribute('aria-expanded', String(open));
        menu.hidden = !open;
        menu.classList.toggle('open', open);
        if (open) {
            const selectedIndex = Math.max(0, records.findIndex(option => option.value === selectedValue));
            setActive(selectedIndex);
        } else {
            trigger.removeAttribute('aria-activedescendant');
            optionButtons.forEach(button => button.classList.remove('active'));
        }
    };
    const choose = (index, { notify = true } = {}) => {
        if (index < 0 || index >= records.length || trigger.disabled) return false;
        const nextValue = records[index].value;
        const changed = nextValue !== selectedValue;
        selectedValue = nextValue;
        activeIndex = index;
        sync();
        setOpen(false);
        if (notify && changed) onChange(nextValue);
        return changed;
    };

    const onTriggerClick = event => {
        event.stopPropagation();
        setOpen(!open);
    };
    const onTriggerKeydown = event => {
        const plan = pickerKeyboardPlan({
            key: event.key,
            open,
            activeIndex,
            optionCount: optionButtons.length,
        });
        if (plan.preventDefault) event.preventDefault();
        if (!plan.handled && event.key !== 'Tab') return;
        if (plan.chooseIndex !== undefined) choose(plan.chooseIndex);
        else {
            setOpen(plan.open);
            if (plan.open) setActive(plan.activeIndex);
        }
    };
    const onPointerMove = event => {
        const option = event.target.closest('.settings-picker-item');
        if (option && menu.contains(option)) setActive(optionButtons.indexOf(option));
    };
    const onMenuClick = event => {
        const option = event.target.closest('.settings-picker-item');
        if (!option || !menu.contains(option)) return;
        event.stopPropagation();
        choose(optionButtons.indexOf(option));
        trigger.focus();
    };
    const onOutsideClick = event => {
        if (!trigger.isConnected || !menu.isConnected) {
            document.removeEventListener('click', onOutsideClick);
        } else if (!trigger.closest('.ui-picker')?.contains(event.target)) {
            setOpen(false);
        }
    };

    trigger.addEventListener('click', onTriggerClick);
    trigger.addEventListener('keydown', onTriggerKeydown);
    menu.addEventListener('pointermove', onPointerMove);
    menu.addEventListener('click', onMenuClick);
    document.addEventListener('click', onOutsideClick);
    sync();
    setOpen(false);

    const api = {
        trigger,
        menu,
        setOpen,
        setValue(nextValue, { notify = false } = {}) {
            const index = records.findIndex(option => option.value === String(nextValue));
            return choose(index, { notify });
        },
        destroy() {
            trigger.removeEventListener('click', onTriggerClick);
            trigger.removeEventListener('keydown', onTriggerKeydown);
            menu.removeEventListener('pointermove', onPointerMove);
            menu.removeEventListener('click', onMenuClick);
            document.removeEventListener('click', onOutsideClick);
            if (trigger._figaroSettingsPicker === api) delete trigger._figaroSettingsPicker;
        },
    };
    trigger._figaroSettingsPicker = api;
    return api;
}

export default enhanceSettingsPicker;
