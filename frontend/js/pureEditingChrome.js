import { getState, setState, subscribe } from './state.js';
import { pureEditingChromeModel } from './core/pureEditingChromeModel.js';
import { normalizePureFocusScope } from './core/pureWritingModel.js';
import { setRightSidebarSuppressed } from './rightSidebarState.js';

function currentModel() {
    return pureEditingChromeModel({
        sidebarCollapsed: getState('sidebarCollapsed'),
        activeTabId: getState('activeTabId'),
        openTabs: getState('openTabs'),
    });
}

/** Apply the pure model at the DOM shell boundary. */
export function renderPureEditingChrome(root = document) {
    const app = root?.querySelector?.('#app');
    if (!app) return false;

    const model = currentModel();
    const wasActive = app.classList.contains('pure-editing-chrome');
    app.classList.toggle('pure-editing-chrome', model.active);
    app.dataset.pureEditingChrome = String(model.active);
    setRightSidebarSuppressed(root?.querySelector?.('#right-sidebar'), model.active);
    if (wasActive !== model.active) {
        root.dispatchEvent?.(new CustomEvent('figaro:pure-editing-chrome-changed', {
            detail: { active: model.active },
        }));
    }
    return model.active;
}

/**
 * Keep the shell synchronized with the active workspace and sidebar. An open
 * right pane is suppressed while Pure is active
 * and returns unchanged when the sidebar expands.
 */
export function initPureEditingChrome(root = document) {
    const app = root?.querySelector?.('#app');
    if (!app || app.dataset.pureEditingChromeInitialized === 'true') return false;

    app.dataset.pureEditingChromeInitialized = 'true';
    const render = () => renderPureEditingChrome(root);
    subscribe('sidebarCollapsed', render);
    subscribe('activeTabId', render);
    subscribe('openTabs', render);

    render();
    return true;
}

export function initPureWritingSettings(root = document) {
    const typewriter = root?.querySelector?.('#pure-typewriter-toggle');
    const focus = root?.querySelector?.('#pure-focus-scope');
    const adaptive = root?.querySelector?.('#pure-adaptive-typography-toggle');
    if (!typewriter || !focus || !adaptive || typewriter.dataset.initialized === 'true') return false;

    typewriter.dataset.initialized = 'true';
    typewriter.checked = Boolean(getState('pureTypewriterEnabled'));
    focus.value = normalizePureFocusScope(getState('pureFocusScope'));
    adaptive.checked = Boolean(getState('pureAdaptiveTypographyEnabled'));

    typewriter.addEventListener('change', () => setState('pureTypewriterEnabled', typewriter.checked));
    focus.addEventListener('change', () => setState('pureFocusScope', normalizePureFocusScope(focus.value)));
    adaptive.addEventListener('change', () => setState('pureAdaptiveTypographyEnabled', adaptive.checked));
    return true;
}
