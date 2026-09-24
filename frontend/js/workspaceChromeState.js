/**
 * Mirror tab-strip and workspace state onto `#app` attributes for CSS.
 *
 * Styles used to read this state through `#app:has(...)` selectors. With
 * `#app` as the subject, every DOM change anywhere in the application (each
 * cursor move updates the editor and the Ln/Col status) made the engine
 * re-check those rules and restyle most of the page, which dominated held-key
 * navigation on slower machines. The attributes change only when the state
 * itself does:
 *
 * - `data-first-tab-active`: the leading document tab is the active one.
 * - `data-first-tab-hover`: the pointer is over an inactive leading tab.
 * - `data-workspace-view="calendar"`: the Calendar workspace is showing.
 */
export function initWorkspaceChromeState({
    app = document.getElementById('app'),
    tabStrip = document.getElementById('tab-strip'),
    subscribe,
    getState,
} = {}) {
    if (!app || !tabStrip) return () => {};
    const setFlag = (name, on) => {
        if (app.hasAttribute(name) !== on) app.toggleAttribute(name, on);
    };
    const leadingTab = () => {
        const first = tabStrip.firstElementChild;
        return first?.classList.contains('ui-document-tab') ? first : null;
    };
    let pointerOverLeading = false;

    function syncTabs() {
        const first = leadingTab();
        const active = Boolean(first?.classList.contains('ui-document-tab--active'));
        // A re-render can replace the hovered element; ask the new one.
        const hovered = Boolean(first && (pointerOverLeading || first.matches(':hover')));
        setFlag('data-first-tab-active', active);
        setFlag('data-first-tab-hover', hovered && !active);
    }

    // Pointer events decide hover from their targets, so the result does not
    // depend on when the engine updates :hover relative to dispatch.
    const onOver = event => {
        const first = leadingTab();
        pointerOverLeading = Boolean(first?.contains(event.target));
        syncTabs();
    };
    const onOut = event => {
        const first = leadingTab();
        pointerOverLeading = Boolean(first?.contains(event.relatedTarget));
        syncTabs();
    };
    tabStrip.addEventListener('pointerover', onOver);
    tabStrip.addEventListener('pointerout', onOut);

    // The tab strip is small and changes only when tabs open, close, reorder
    // or change state; the editor is outside it.
    const observer = new MutationObserver(syncTabs);
    observer.observe(tabStrip, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    function syncWorkspace() {
        const activeId = getState?.('activeTabId');
        const active = (getState?.('openTabs') || []).find(tab => tab.id === activeId);
        const view = active?.type === 'calendar-workspace' ? 'calendar' : '';
        if ((app.getAttribute('data-workspace-view') || '') !== view) {
            if (view) app.setAttribute('data-workspace-view', view);
            else app.removeAttribute('data-workspace-view');
        }
    }
    const unsubscribe = subscribe?.('activeTabId', syncWorkspace, 'workspace chrome') || (() => {});

    syncTabs();
    syncWorkspace();
    return () => {
        observer.disconnect();
        tabStrip.removeEventListener('pointerover', onOver);
        tabStrip.removeEventListener('pointerout', onOut);
        unsubscribe();
    };
}
