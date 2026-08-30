const SETTINGS_TARGET_EVENT = 'figaro:open-settings-target';

export function revealSettingsTarget(root, selector) {
    const target = root.querySelector(selector);
    if (!target) return null;
    const section = target.closest('.settings-section') || target;
    target.focus?.({ preventScroll: true });
    section.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    section.classList.add('settings-search-target');
    (root.defaultView || window).setTimeout(() => {
        section.classList.remove('settings-search-target');
    }, 1800);
    return target;
}

/** Connect help-search destinations to the existing Settings workspace tab. */
export function initSettingsNavigation({ root = document, openSettings } = {}) {
    if (root.documentElement.dataset.settingsNavigationBound === 'true') return false;
    root.documentElement.dataset.settingsNavigationBound = 'true';
    root.addEventListener(SETTINGS_TARGET_EVENT, event => {
        const selector = String(event.detail?.selector || '');
        if (!selector) return;
        openSettings?.();
        (root.defaultView || window).setTimeout(() => revealSettingsTarget(root, selector), 0);
    });
    return true;
}

export function requestSettingsTarget(root, selector) {
    root.dispatchEvent(new CustomEvent(SETTINGS_TARGET_EVENT, { detail: { selector } }));
}
