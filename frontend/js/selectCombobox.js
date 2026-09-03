import { setTooltip } from './tooltip.js';
import { planFloatingMenuPlacement } from './core/floatingMenuModel.js';

/**
 * Replace a native select's host-controlled popup with Figaro's themed,
 * keyboard-accessible select-only combobox while retaining the select as the
 * form/state source of truth.
 */
export function enhanceSelectCombobox(select, {
    className = '',
    ariaLabel = '',
    floating = true,
} = {}) {
    if (!select || select.dataset.comboboxEnhanced === 'true') return select?._figaroCombobox || null;

    let options = Array.from(select.options || []);
    if (!options.length) return null;
    const id = select.id || `figaro-select-${Math.random().toString(36).slice(2)}`;
    const wrapper = document.createElement('div');
    wrapper.className = `ui-picker settings-picker select-combobox ${className}`.trim();
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ui-picker-trigger settings-picker-btn select-combobox-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `${id}-menu`);
    trigger.setAttribute('aria-label', ariaLabel || select.getAttribute('aria-label') || select.labels?.[0]?.textContent?.trim() || 'Choose option');
    const describedBy = select.getAttribute('aria-describedby');
    if (describedBy) trigger.setAttribute('aria-describedby', describedBy);
    trigger.innerHTML = `<span class="select-combobox-label"></span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

    const menu = document.createElement('div');
    menu.id = `${id}-menu`;
    menu.className = 'ui-menu ui-picker-menu settings-picker-menu select-combobox-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', `${trigger.getAttribute('aria-label')} options`);
    menu.hidden = true;

    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(trigger, menu, select);
    select.classList.add('select-combobox-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.dataset.comboboxEnhanced = 'true';

    let optionButtons = [];
    let activeIndex = Math.max(0, options.findIndex(option => option.value === select.value));
    let menuOpen = false;
    const clearMenuPlacement = () => {
        delete menu.dataset.floating;
        delete menu.dataset.placement;
        for (const property of ['top', 'left', 'width', 'max-height']) menu.style.removeProperty(property);
    };
    const positionMenu = () => {
        if (!menuOpen) return;
        if (!floating) {
            clearMenuPlacement();
            return;
        }
        if (!wrapper.isConnected) {
            setOpen(false);
            return;
        }
        const plan = planFloatingMenuPlacement({
            trigger: trigger.getBoundingClientRect(),
            menuHeight: menu.scrollHeight,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        });
        menu.dataset.floating = 'true';
        menu.dataset.placement = plan.placement;
        menu.style.top = `${plan.top}px`;
        menu.style.left = `${plan.left}px`;
        menu.style.width = `${plan.width}px`;
        menu.style.maxHeight = `${plan.maxHeight}px`;
    };
    const startTrackingPlacement = () => {
        window.addEventListener('resize', positionMenu);
        window.addEventListener('scroll', positionMenu, true);
    };
    const stopTrackingPlacement = () => {
        window.removeEventListener('resize', positionMenu);
        window.removeEventListener('scroll', positionMenu, true);
    };
    const sync = () => {
        const selectedIndex = Math.max(0, options.findIndex(option => option.value === select.value));
        activeIndex = selectedIndex;
        trigger.querySelector('.select-combobox-label').textContent = options[selectedIndex]?.textContent || '';
        optionButtons.forEach((button, index) => {
            const selected = index === selectedIndex;
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-selected', String(selected));
        });
    };
    const setActive = index => {
        if (!optionButtons.length) {
            activeIndex = -1;
            trigger.removeAttribute('aria-activedescendant');
            return;
        }
        activeIndex = (index + optionButtons.length) % optionButtons.length;
        optionButtons.forEach((button, buttonIndex) => button.classList.toggle('active', buttonIndex === activeIndex));
        trigger.setAttribute('aria-activedescendant', optionButtons[activeIndex].id);
    };
    const setOpen = requestedOpen => {
        const shouldOpen = Boolean(requestedOpen && optionButtons.length && !select.disabled && !trigger.disabled);
        const changed = shouldOpen !== menuOpen;
        menuOpen = shouldOpen;
        trigger.setAttribute('aria-expanded', String(shouldOpen));
        menu.hidden = !shouldOpen;
        menu.classList.toggle('open', shouldOpen);
        if (shouldOpen) {
            positionMenu();
            if (changed && floating) startTrackingPlacement();
            setActive(Math.max(0, options.findIndex(option => option.value === select.value)));
        }
        else {
            if (changed) stopTrackingPlacement();
            clearMenuPlacement();
            trigger.removeAttribute('aria-activedescendant');
            optionButtons.forEach(button => button.classList.remove('active'));
        }
    };
    const refresh = () => {
        options = Array.from(select.options || []);
        menu.innerHTML = options.map((option, index) => `
            <button type="button" id="${id}-option-${index}" class="ui-menu-item settings-picker-item select-combobox-option" role="option" data-value="${escapeAttribute(option.value)}" aria-selected="false" tabindex="-1">
                <span>${escapeHTML(option.textContent)}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            </button>`).join('');
        optionButtons = Array.from(menu.querySelectorAll('.select-combobox-option'));
        activeIndex = Math.max(0, options.findIndex(option => option.value === select.value));
        setOpen(false);
        sync();
    };
    const choose = index => {
        if (index < 0 || index >= options.length || select.disabled) return;
        const changed = select.value !== options[index].value;
        select.value = options[index].value;
        sync();
        setOpen(false);
        if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
        trigger.focus();
    };

    trigger.addEventListener('click', event => {
        event.stopPropagation();
        setOpen(trigger.getAttribute('aria-expanded') !== 'true');
    });
    trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (trigger.getAttribute('aria-expanded') !== 'true') setOpen(true);
            else setActive(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
        } else if ((event.key === 'Enter' || event.key === ' ') && trigger.getAttribute('aria-expanded') === 'true') {
            event.preventDefault();
            choose(activeIndex);
        } else if ((event.key === 'Home' || event.key === 'End') && trigger.getAttribute('aria-expanded') === 'true') {
            event.preventDefault();
            setActive(event.key === 'Home' ? 0 : optionButtons.length - 1);
        } else if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
        }
    });
    menu.addEventListener('pointermove', event => {
        const button = event.target.closest('.select-combobox-option');
        if (button) setActive(optionButtons.indexOf(button));
    });
    menu.addEventListener('click', event => {
        const button = event.target.closest('.select-combobox-option');
        if (!button) return;
        event.stopPropagation();
        choose(optionButtons.indexOf(button));
    });
    select.addEventListener('change', sync);
    const closeOnOutsideClick = event => {
        if (!wrapper.isConnected) {
            setOpen(false);
            document.removeEventListener('click', closeOnOutsideClick);
        }
        else if (!wrapper.contains(event.target)) setOpen(false);
    };
    document.addEventListener('click', closeOnOutsideClick);

    const api = {
        wrapper,
        trigger,
        menu,
        sync,
        refresh,
        setDisabled(disabled, { busy = false } = {}) {
            select.disabled = Boolean(disabled);
            trigger.disabled = Boolean(disabled);
            trigger.dataset.busy = String(Boolean(disabled && busy));
            setTooltip(trigger, select.getAttribute('data-ui-tooltip') || select.title || '');
            if (disabled) setOpen(false);
        },
    };
    for (const label of Array.from(select.labels || [])) {
        label.addEventListener('click', event => {
            event.preventDefault();
            if (!trigger.disabled) trigger.focus();
        });
    }
    select._figaroCombobox = api;
    refresh();
    return api;
}

function escapeHTML(value) {
    const element = document.createElement('span');
    element.textContent = String(value || '');
    return element.innerHTML;
}

function escapeAttribute(value) {
    return escapeHTML(value).replaceAll('`', '&#96;');
}

export default enhanceSelectCombobox;
