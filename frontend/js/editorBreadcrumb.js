import { getState, setState, subscribe } from './state.js';
import { editorBreadcrumbModel } from './core/editorBreadcrumbModel.js';

function currentBreadcrumbModel() {
    return editorBreadcrumbModel({
        enabled: getState('showEditorBreadcrumbs'),
        activeTabId: getState('activeTabId'),
        openTabs: getState('openTabs'),
    });
}
export function renderEditorBreadcrumb(root = document) {
    const breadcrumb = root?.querySelector?.('#editor-breadcrumb');
    if (!breadcrumb) return false;

    const model = currentBreadcrumbModel();
    breadcrumb.hidden = !model.visible;
    breadcrumb.replaceChildren();
    if (!model.visible) return false;

    const documentRef = breadcrumb.ownerDocument;
    const list = documentRef.createElement('ol');
    list.className = 'editor-breadcrumb-list';

    model.segments.forEach((segment, index) => {
        const item = documentRef.createElement('li');
        item.className = 'editor-breadcrumb-item';
        if (index === model.segments.length - 1) {
            item.classList.add('current');
            item.setAttribute('aria-current', 'page');
        }
        item.textContent = segment;
        list.appendChild(item);
    });

    breadcrumb.appendChild(list);
    return true;
}

export function initEditorBreadcrumb(root = document) {
    const breadcrumb = root?.querySelector?.('#editor-breadcrumb');
    if (!breadcrumb || breadcrumb.dataset.initialized === 'true') return false;

    breadcrumb.dataset.initialized = 'true';
    const render = () => renderEditorBreadcrumb(root);
    subscribe('showEditorBreadcrumbs', render);
    subscribe('activeTabId', render);
    subscribe('openTabs', render);
    render();
    return true;
}

export function initEditorBreadcrumbSetting(root = document) {
    const toggle = root?.querySelector?.('#editor-breadcrumbs-toggle');
    if (!toggle || toggle.dataset.initialized === 'true') return false;

    toggle.dataset.initialized = 'true';
    toggle.checked = Boolean(getState('showEditorBreadcrumbs'));
    toggle.addEventListener('change', () => {
        setState('showEditorBreadcrumbs', toggle.checked);
    });
    return true;
}
