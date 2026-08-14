import { backend } from './backend.js';
import { log } from './log.js';
import { setEditorTabSize } from './editor.js';
import {
    defaultTabSize,
    maximumTabSize,
    minimumTabSize,
    normalizeTabSize,
    steppedTabSize,
} from './core/tabSizeModel.js';

let current = defaultTabSize;
let persisted = defaultTabSize;
let loaded = false;
let loadPromise = null;
let revision = 0;
let saveQueue = Promise.resolve();

function apply(value) {
    setEditorTabSize(value);
}

function syncControl(control) {
    const input = control.querySelector('.tab-size-value');
    const down = control.querySelector('.tab-size-down');
    const up = control.querySelector('.tab-size-up');
    if (!input || !down || !up) return;
    input.value = String(current);
    down.disabled = current <= minimumTabSize;
    up.disabled = current >= maximumTabSize;
    control.dataset.tabSize = String(current);
}

function syncControls(root = document) {
    root.querySelectorAll?.('.tab-size-control').forEach(syncControl);
}

export function getTabSizePreference() {
    return current;
}

export async function initTabSizePreference() {
    if (loaded) {
        apply(current);
        return current;
    }
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        try {
            const api = backend();
            const result = typeof api.TabSizeLoad === 'function'
                ? await api.TabSizeLoad()
                : { size: defaultTabSize };
            current = normalizeTabSize(result?.size);
        } catch (error) {
            log.warn('Could not load the tab-size preference:', error);
            current = defaultTabSize;
        }
        persisted = current;
        loaded = true;
        apply(current);
        syncControls();
        return current;
    })();
    try {
        return await loadPromise;
    } finally {
        loadPromise = null;
    }
}

export async function setTabSizePreference(value) {
    await initTabSizePreference();
    const requested = normalizeTabSize(value, current);
    if (requested === current) {
        syncControls();
        return true;
    }

    const requestRevision = ++revision;
    current = requested;
    apply(current);
    syncControls();

    const save = async () => {
        try {
            const api = backend();
            if (typeof api.TabSizeSave !== 'function') {
                throw new Error('The backend does not expose tab-size settings.');
            }
            const result = await api.TabSizeSave(requested);
            if (!result?.success) throw new Error(result?.error || 'Could not save the tab-size preference.');
            persisted = requested;
            return true;
        } catch (error) {
            log.warn('Could not save the tab-size preference:', error);
            if (requestRevision === revision) {
                current = persisted;
                apply(current);
                syncControls();
            }
            return false;
        }
    };
    const result = saveQueue.then(save, save);
    saveQueue = result.then(() => undefined, () => undefined);
    return result;
}

export async function initTabSizeSettings(root = document) {
    await initTabSizePreference();
    const control = root.querySelector?.('.tab-size-control');
    if (!control || control.dataset.tabSizeBound === 'true') return;
    const input = control.querySelector('.tab-size-value');
    const down = control.querySelector('.tab-size-down');
    const up = control.querySelector('.tab-size-up');
    if (!input || !down || !up) return;

    control.dataset.tabSizeBound = 'true';
    syncControl(control);
    const saveValue = async value => {
        control.setAttribute('aria-busy', 'true');
        const saved = await setTabSizePreference(value);
        if (!control.isConnected) return;
        syncControl(control);
        control.removeAttribute('aria-busy');
        const failure = saved ? '' : 'Could not save the tab size; the previous value was restored.';
        control.title = failure;
        input.setCustomValidity(failure);
    };
    down.addEventListener('click', () => saveValue(steppedTabSize(current, -1)));
    up.addEventListener('click', () => saveValue(steppedTabSize(current, 1)));
    input.addEventListener('change', () => saveValue(input.value));
    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        saveValue(input.value);
        input.select();
    });
}

export default {
    getTabSizePreference,
    initTabSizePreference,
    initTabSizeSettings,
    setTabSizePreference,
};
