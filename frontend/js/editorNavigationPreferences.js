import { backend } from './backend.js';
import { log } from './log.js';
import { setMarkdownBlockGuides } from './editor.js';
import { setDocumentOutlineEnabled, setStickyHeadingsEnabled } from './outline.js';
import {
    editorNavigationDefaults,
    normalizeEditorNavigationPreference,
    updateEditorNavigationPreference,
} from './core/editorNavigationModel.js';

let current = { ...editorNavigationDefaults };
let persisted = { ...editorNavigationDefaults };
let loaded = false;
let loadPromise = null;
let revision = 0;
let saveQueue = Promise.resolve();

const controls = {
    stickyHeadings: 'sticky-headings-toggle',
    blockGuides: 'markdown-block-guides-toggle',
    documentOutline: 'document-outline-toggle',
};

function apply(preference) {
    if (typeof setStickyHeadingsEnabled === 'function') setStickyHeadingsEnabled(preference.stickyHeadings);
    if (typeof setMarkdownBlockGuides === 'function') setMarkdownBlockGuides(preference.blockGuides);
    if (typeof setDocumentOutlineEnabled === 'function') setDocumentOutlineEnabled(preference.documentOutline);
}

function syncControls(root = document) {
    for (const [key, id] of Object.entries(controls)) {
        root.querySelectorAll?.(`#${id}`).forEach(control => {
            control.checked = current[key];
        });
    }
}

export function getEditorNavigationPreference() {
    return { ...current };
}

export async function initEditorNavigationPreference() {
    if (loaded) {
        apply(current);
        return getEditorNavigationPreference();
    }
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
        try {
            current = normalizeEditorNavigationPreference(await backend().EditorNavigationLoad());
        } catch (error) {
            log.warn('Could not load editor navigation preferences:', error);
            current = { ...editorNavigationDefaults };
        }
        persisted = { ...current };
        loaded = true;
        apply(current);
        syncControls();
        return getEditorNavigationPreference();
    })();
    return loadPromise;
}

export async function setEditorNavigationPreference(key, enabled) {
    await initEditorNavigationPreference();
    const requested = updateEditorNavigationPreference(current, key, enabled);
    const requestRevision = ++revision;
    current = requested;
    apply(current);
    syncControls();

    const save = async () => {
        try {
            const result = await backend().EditorNavigationSave(
                requested.stickyHeadings,
                requested.blockGuides,
                requested.documentOutline,
            );
            if (!result?.success) throw new Error(result?.error || 'Could not save editor navigation preferences.');
            persisted = { ...requested };
            return true;
        } catch (error) {
            log.warn('Could not save editor navigation preferences:', error);
            if (requestRevision === revision) {
                current = { ...persisted };
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

export async function initEditorNavigationSettings(root = document) {
    await initEditorNavigationPreference();
    for (const [key, id] of Object.entries(controls)) {
        const control = root.querySelector?.(`#${id}`);
        if (!control || control.dataset.navigationPreferenceBound === 'true') continue;
        control.dataset.navigationPreferenceBound = 'true';
        control.checked = current[key];
        control.addEventListener('change', async () => {
            control.disabled = true;
            const saved = await setEditorNavigationPreference(key, control.checked);
            control.checked = current[key];
            control.disabled = false;
            control.title = saved ? '' : 'Could not save this navigation preference; the previous setting was restored.';
        });
    }
}

export default {
    getEditorNavigationPreference,
    initEditorNavigationPreference,
    initEditorNavigationSettings,
    setEditorNavigationPreference,
};
