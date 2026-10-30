import { backend } from './backend.js';
/**
 * Excalidraw integration for editable .excalidraw.svg drawings.
 *
 * The editor is vendored (frontend/vendored/excalidraw, window.FigaroExcalidraw)
 * and runs offline. It stores the scene inside the exported SVG, so the file
 * stays a regular image for notes, PDFs and other tools and reopens as an
 * editable drawing. Drawings save like notes: Ctrl/Cmd+S, the Auto-Save
 * interval, and the unsaved-changes prompts when closing.
 */

import { log } from './log.js';
import { isDrawioDarkTheme } from './drawio.js';
import {
    isDrawingEdit,
    isNewerDrawingFile,
    shouldReloadDrawing,
} from './core/excalidrawDrawingModel.js';

let workspacePorts = null;

export function configureExcalidrawWorkspace(ports) {
    if (
        typeof ports?.findTab !== 'function'
        || typeof ports?.recordTabEdit !== 'function'
        || typeof ports?.recordTabMtime !== 'function'
        || typeof ports?.saveFileSnapshot !== 'function'
        || typeof ports?.refreshFileTree !== 'function'
    ) throw new TypeError('Excalidraw workspace ports are incomplete');
    workspacePorts = Object.freeze({ ...ports });
}

function workspace() {
    if (!workspacePorts) throw new Error('Excalidraw workspace ports were not configured');
    return workspacePorts;
}

function vendor() {
    const api = typeof window !== 'undefined' ? window.FigaroExcalidraw : null;
    if (!api) throw new Error('The Excalidraw editor did not load');
    return api;
}

function editorTheme() {
    return isDrawioDarkTheme() ? 'dark' : 'light';
}

/**
 * Publish the rendered surface's lightness so CSS can adapt embedded
 * drawings, which are always exported in Excalidraw's light palette.
 */
export function trackExcalidrawSurface(root = document.documentElement) {
    const update = () => { root.dataset.figaroSurface = editorTheme(); };
    update();
    document.addEventListener('figaro:appearance-changed', update);
}

export async function renderExcalidrawTab(panel, tab) {
    if (!panel || !tab?.path) return;
    if (panel._excalidrawPath === tab.path && panel._excalidrawSession) return;

    disposeExcalidrawTab(panel);
    const requestId = (panel._excalidrawRequestId || 0) + 1;
    panel._excalidrawRequestId = requestId;
    panel._excalidrawPath = tab.path;
    panel.innerHTML = `
        <div class="excalidraw-view">
            <div class="excalidraw-message" role="status" aria-live="polite">
                <span class="ui-spinner" aria-hidden="true"></span>
                <span>Opening drawing…</span>
            </div>
        </div>`;

    try {
        const editor = vendor();
        const result = await backend().ReadDiagram(tab.path);
        if (!isCurrentRequest(panel, requestId)) return;
        if (!result) throw new Error('The drawing file was not found.');
        const scene = await editor.loadSceneFromSVG(result.content || '');
        if (!isCurrentRequest(panel, requestId)) return;

        workspace().recordTabMtime(tab.id, result.mtime);
        mountExcalidrawEditor(panel, editor, scene);
    } catch (error) {
        log.error('Unable to open Excalidraw drawing:', error);
        if (!isCurrentRequest(panel, requestId)) return;
        panel.innerHTML = `
            <div class="excalidraw-view">
                <div class="ui-notice ui-notice--danger excalidraw-message" role="alert">
                    <strong>Couldn’t open this drawing</strong>
                    <span data-excalidraw-error></span>
                </div>
            </div>`;
        panel.querySelector('[data-excalidraw-error]').textContent = error?.message
            || 'The file is not an Excalidraw SVG with an embedded scene.';
    }
}

function isCurrentRequest(panel, requestId) {
    return panel.isConnected && panel._excalidrawRequestId === requestId;
}

export function disposeExcalidrawTab(panel) {
    panel?._excalidrawSession?.dispose();
    if (!panel) return;
    panel._excalidrawSession = null;
    panel._excalidrawPath = null;
}

function mountExcalidrawEditor(panel, vendorAPI, scene) {
    panel.innerHTML = '<div class="excalidraw-view"><div class="excalidraw-stage" data-excalidraw-stage></div></div>';
    const stage = panel.querySelector('[data-excalidraw-stage]');
    // Tab ids follow the file path; the panel's id is kept current across moves.
    const currentTab = () => workspace().findTab(panel.dataset.tabId);
    const session = {
        lastVersion: null,
        saving: 0,
        editor: null,
    };

    session.editor = vendorAPI.mount(stage, {
        scene,
        theme: editorTheme(),
        onChange: ({ version }) => {
            const edited = isDrawingEdit(session.lastVersion, version);
            session.lastVersion = version;
            const tab = edited ? currentTab() : null;
            if (tab) workspace().recordTabEdit(tab.id);
        },
    });

    session.save = async (options = {}) => {
        const tab = currentTab();
        if (!tab) return null;
        if (!tab.dirty) return { success: true, path: tab.path, mtime: tab.mtime };
        // Edits made while the SVG is exported keep the tab dirty.
        const editGeneration = tab._editGeneration || 0;
        session.saving += 1;
        try {
            const svg = await session.editor.exportSVG();
            const result = await workspace().saveFileSnapshot(tab, svg, { ...options, editGeneration });
            if (result?.success) workspace().refreshFileTree().catch(() => {});
            return result;
        } finally {
            session.saving -= 1;
        }
    };

    const reloadFromDisk = async scope => {
        const tab = currentTab();
        if (!shouldReloadDrawing({ scope, path: tab?.path, dirty: tab?.dirty, saving: session.saving > 0 })) return;
        try {
            const result = await backend().ReadDiagram(tab.path);
            const latest = currentTab();
            if (session.disposed || !latest || latest.dirty || !isNewerDrawingFile(result, latest.mtime)) return;
            const next = await vendorAPI.loadSceneFromSVG(result.content || '');
            if (session.disposed || currentTab()?.dirty) return;
            session.lastVersion = null;
            session.editor.replaceScene(next);
            workspace().recordTabMtime(latest.id, result.mtime);
        } catch (error) {
            log.warn('Could not reload the Excalidraw drawing after a vault change:', error);
        }
    };

    const onAppearanceChanged = () => session.editor.setTheme(editorTheme());
    const onVaultChanged = event => { void reloadFromDisk(event.detail ? event.detail.paths : null); };
    document.addEventListener('figaro:appearance-changed', onAppearanceChanged);
    document.addEventListener('vault-filesystem-changed', onVaultChanged);

    session.dispose = () => {
        if (session.disposed) return;
        session.disposed = true;
        document.removeEventListener('figaro:appearance-changed', onAppearanceChanged);
        document.removeEventListener('vault-filesystem-changed', onVaultChanged);
        session.editor.unmount();
    };
    panel._excalidrawSession = session;
}
