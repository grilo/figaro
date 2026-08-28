import { getState, setState, subscribe } from './state.js';
import { pureEditingChromeModel } from './core/pureEditingChromeModel.js';

function currentModel(root = document) {
    return pureEditingChromeModel({
        enabled: getState('pureEditingChromeEnabled'),
        sidebarCollapsed: getState('sidebarCollapsed'),
        activeTabId: getState('activeTabId'),
        openTabs: getState('openTabs'),
        detailsPaneOpen: root?.querySelector?.('#right-sidebar')?.classList.contains('open'),
    });
}

/** Apply the pure model at the DOM shell boundary. */
export function renderPureEditingChrome(root = document) {
    const app = root?.querySelector?.('#app');
    if (!app) return false;

    const model = currentModel(root);
    app.classList.toggle('pure-editing-chrome', model.active);
    app.dataset.pureEditingChrome = String(model.active);
    return model.active;
}

/**
 * Keep the shell synchronized with the preference, active workspace, sidebar,
 * and right-pane visibility. Right-pane state lives at the DOM adapter today,
 * so a narrow class observer bridges only that existing effect boundary.
 */
export function initPureEditingChrome(root = document) {
    const app = root?.querySelector?.('#app');
    if (!app || app.dataset.pureEditingChromeInitialized === 'true') return false;

    app.dataset.pureEditingChromeInitialized = 'true';
    const render = () => renderPureEditingChrome(root);
    subscribe('pureEditingChromeEnabled', render);
    subscribe('sidebarCollapsed', render);
    subscribe('activeTabId', render);
    subscribe('openTabs', render);

    const rightSidebar = root.querySelector?.('#right-sidebar');
    if (rightSidebar && typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(render);
        observer.observe(rightSidebar, { attributes: true, attributeFilter: ['class'] });
    }

    render();
    return true;
}

export function initPureEditingChromeSetting(root = document) {
    const toggle = root?.querySelector?.('#pure-editing-chrome-toggle');
    if (!toggle || toggle.dataset.initialized === 'true') return false;

    toggle.dataset.initialized = 'true';
    toggle.checked = Boolean(getState('pureEditingChromeEnabled'));
    toggle.addEventListener('change', () => {
        setState('pureEditingChromeEnabled', toggle.checked);
    });
    return true;
}
