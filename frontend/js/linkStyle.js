import { confirmDialog, errorDialog } from './dialogs.js';
import { log } from './log.js';

const validStyles = new Set(['markdown', 'wikilink']);
let currentStyle = 'markdown';
let preferenceLoaded = false;
let preferenceLoadPromise = null;

function canonicalStyle(value) {
    return validStyles.has(value) ? value : 'markdown';
}

function syncLinkStyleSelectors() {
    document.querySelectorAll('#link-style-select').forEach(select => {
        select.value = currentStyle;
    });
}

export function getLinkStylePreference() {
    return currentStyle;
}

export async function initLinkStylePreference() {
    if (preferenceLoaded) return currentStyle;
    if (preferenceLoadPromise) return preferenceLoadPromise;
    preferenceLoadPromise = (async () => {
        try {
            const result = await window.pywebview.api.link_style_load();
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
        const result = await window.pywebview.api.change_link_style(requested, rewrite);
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
    const select = root?.querySelector?.('#link-style-select');
    if (!select) return;
    await initLinkStylePreference();
    if (!select.isConnected) return;
    select.value = currentStyle;
    select.addEventListener('change', async () => {
        const requested = select.value;
        select.disabled = true;
        await requestLinkStyleChange(requested);
        if (select.isConnected) {
            select.value = currentStyle;
            select.disabled = false;
        }
    });
}

export function resetLinkStyleForTests() {
    currentStyle = 'markdown';
    preferenceLoaded = false;
    preferenceLoadPromise = null;
}
