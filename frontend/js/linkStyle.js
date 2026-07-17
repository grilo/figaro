import { backend } from './backend.js';
import { confirmDialog, errorDialog } from './dialogs.js';
import { log } from './log.js';

const validStyles = new Set(['markdown', 'wikilink']);
const styleLabels = { markdown: 'Markdown', wikilink: 'Wikilinks' };
let currentStyle = 'markdown';
let preferenceLoaded = false;
let preferenceLoadPromise = null;

function canonicalStyle(value) {
    return validStyles.has(value) ? value : 'markdown';
}

function renderLinkStyleControl(trigger) {
    if (!trigger) return;
    trigger.value = currentStyle;
    trigger.dataset.value = currentStyle;

    const picker = trigger.closest('.link-style-picker');
    const label = picker?.querySelector('#link-style-current-name');
    if (label) label.textContent = styleLabels[currentStyle];
    picker?.querySelectorAll('[data-link-style]').forEach(option => {
        const selected = option.dataset.linkStyle === currentStyle;
        option.setAttribute('aria-selected', String(selected));
        option.classList.toggle('selected', selected);
    });
}

function syncLinkStyleSelectors() {
    document.querySelectorAll('#link-style-select').forEach(renderLinkStyleControl);
}

export function getLinkStylePreference() {
    return currentStyle;
}

export async function initLinkStylePreference() {
    if (preferenceLoaded) return currentStyle;
    if (preferenceLoadPromise) return preferenceLoadPromise;
    preferenceLoadPromise = (async () => {
        try {
            const result = await backend().LinkStyleLoad();
            currentStyle = canonicalStyle(result?.style);
            preferenceLoaded = true;
            syncLinkStyleSelectors();
        } catch (error) {
            log.warn('Could not load link style preference:', error);
        } finally {
            preferenceLoadPromise = null;
        }
        return currentStyle;
    })();
    return preferenceLoadPromise;
}

export async function requestLinkStyleChange(requestedStyle) {
    const requested = canonicalStyle(requestedStyle);
    if (requested === currentStyle) return { success: true, style: currentStyle, updated_links: [] };

    const label = requested === 'wikilink' ? 'Wikilinks' : 'Markdown links';
    const choice = await confirmDialog(
        `Use ${label}?`,
        'Figaro can safely rewrite links to existing Markdown files in this vault. External URLs, email links, images, code, and unresolved links will stay untouched.',
        false,
        false,
        {
            icon: 'question',
            confirmLabel: 'Rewrite vault links',
            extraLabel: 'Keep existing links',
            cancelLabel: 'Cancel',
        }
    );
    if (!choice) return { success: false, cancelled: true, style: currentStyle };

    const rewrite = choice === 'confirm';
    if (rewrite) {
        const { prepareTabsForVaultLinkRewrite } = await import('./tabManager.js');
        const prepared = await prepareTabsForVaultLinkRewrite();
        if (!prepared?.success) {
            await errorDialog('Links were not changed', prepared?.error, 'Open notes could not be saved safely.');
            return { success: false, style: currentStyle, error: prepared?.error };
        }
    }

    try {
        const result = await backend().ChangeLinkStyle(requested, rewrite);
        if (!result?.success) {
            throw new Error(result?.error || 'The link preference could not be saved.');
        }
        currentStyle = canonicalStyle(result.style || requested);
        preferenceLoaded = true;
        syncLinkStyleSelectors();
        window.dispatchEvent(new CustomEvent('figaro:link-style-changed', { detail: { style: currentStyle } }));
        if (rewrite && result.updated_links?.length) {
            const { refreshTabsForUpdatedLinks } = await import('./tabManager.js');
            await refreshTabsForUpdatedLinks(result.updated_links);
        }
        return result;
    } catch (error) {
        log.warn('Could not change link style:', error);
        syncLinkStyleSelectors();
        await errorDialog('Links were not changed', error, 'The link preference could not be saved.');
        return { success: false, style: currentStyle, error: String(error?.message || error) };
    }
}

export async function initLinkStyleSetting(root = document) {
    const trigger = root?.querySelector?.('#link-style-select');
    if (!trigger) return;
    await initLinkStylePreference();
    if (!trigger.isConnected) return;
    renderLinkStyleControl(trigger);
    if (trigger.dataset.linkStyleBound === 'true') return;

    const picker = trigger.closest('.link-style-picker');
    const menu = picker?.querySelector('#link-style-menu');
    const options = Array.from(menu?.querySelectorAll('[data-link-style]') || []);
    if (!picker || !menu || !options.length) return;
    trigger.dataset.linkStyleBound = 'true';

    let activeIndex = Math.max(0, options.findIndex(option => option.dataset.linkStyle === currentStyle));
    const setActive = index => {
        activeIndex = (index + options.length) % options.length;
        options.forEach((option, optionIndex) => option.classList.toggle('active', optionIndex === activeIndex));
        trigger.setAttribute('aria-activedescendant', options[activeIndex].id);
    };
    const setOpen = (open) => {
        const shouldOpen = Boolean(open && !trigger.disabled);
        trigger.setAttribute('aria-expanded', String(shouldOpen));
        menu.hidden = !shouldOpen;
        menu.classList.toggle('open', shouldOpen);
        if (shouldOpen) {
            setActive(options.findIndex(option => option.dataset.linkStyle === currentStyle));
        } else {
            trigger.removeAttribute('aria-activedescendant');
            options.forEach(option => option.classList.remove('active'));
        }
    };

    const choose = async (requested) => {
        if (trigger.disabled || !validStyles.has(requested)) return;
        setOpen(false);
        trigger.disabled = true;
        picker.setAttribute('aria-busy', 'true');
        try {
            await requestLinkStyleChange(requested);
        } finally {
            if (trigger.isConnected) {
                renderLinkStyleControl(trigger);
                trigger.disabled = false;
                picker.removeAttribute('aria-busy');
                trigger.focus();
            }
        }
    };

    trigger.addEventListener('click', event => {
        event.stopPropagation();
        setOpen(trigger.getAttribute('aria-expanded') !== 'true');
    });
    trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (trigger.getAttribute('aria-expanded') !== 'true') {
                setOpen(true);
            } else {
                setActive(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
            }
        } else if ((event.key === 'Enter' || event.key === ' ') && trigger.getAttribute('aria-expanded') === 'true') {
            event.preventDefault();
            void choose(options[activeIndex].dataset.linkStyle);
        } else if (event.key === 'Home' || event.key === 'End') {
            if (trigger.getAttribute('aria-expanded') === 'true') {
                event.preventDefault();
                setActive(event.key === 'Home' ? 0 : options.length - 1);
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            trigger.focus();
        }
    });
    menu.addEventListener('pointermove', event => {
        const option = event.target.closest('[data-link-style]');
        if (option) setActive(options.indexOf(option));
    });
    menu.addEventListener('click', event => {
        const option = event.target.closest('[data-link-style]');
        if (!option) return;
        event.stopPropagation();
        void choose(option.dataset.linkStyle);
    });

    const closeOnOutsideClick = event => {
        if (!trigger.isConnected) {
            document.removeEventListener('click', closeOnOutsideClick);
        } else if (!picker.contains(event.target)) {
            setOpen(false);
        }
    };
    document.addEventListener('click', closeOnOutsideClick);
}

export function resetLinkStyleForTests() {
    currentStyle = 'markdown';
    preferenceLoaded = false;
    preferenceLoadPromise = null;
}
