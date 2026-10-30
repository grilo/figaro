import { backend } from './backend.js';
/**
 * Excalidraw integration for editable .excalidraw.svg drawings.
 *
 * The editor is vendored (frontend/vendored/excalidraw) and runs offline. It
 * stores the scene inside the exported SVG, so the file stays a regular image
 * for notes, PDFs and other tools, and reopens as an editable drawing.
 */

import { log } from './log.js';
import { isDrawioDarkTheme } from './drawio.js';

export const excalidrawAutosaveMs = 1200;
let workspacePorts = null;

export function configureExcalidrawWorkspace(ports) {
    if (
        typeof ports?.markTabDirty !== 'function'
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

function editorTheme() {
    return isDrawioDarkTheme() ? 'dark' : 'light';
}

// Publishes the rendered surface's lightness so CSS can adapt embedded
// drawings, which are always exported in Excalidraw's light palette.
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
    panel.innerHTML = '<div class="excalidraw-view"><p class="excalidraw-status">Opening drawing…</p></div>';

    try {
        const vendor = window.FigaroExcalidraw;
        if (!vendor) throw new Error('The Excalidraw editor did not load');
        const result = await backend().ReadDiagram(tab.path);
        if (!panel.isConnected || panel._excalidrawRequestId !== requestId) return;
        if (!result) throw new Error('Drawing file was not found');
        const scene = await vendor.loadSceneFromSVG(result.content || '');
        if (!panel.isConnected || panel._excalidrawRequestId !== requestId) return;

        workspace().recordTabMtime(tab.id, result.mtime);
        mountExcalidrawEditor(panel, tab, vendor, scene);
    } catch (error) {
        log.error('Unable to open Excalidraw drawing:', error);
        if (panel.isConnected && panel._excalidrawRequestId === requestId) {
            panel.innerHTML = '<div class="excalidraw-view"><p class="excalidraw-error"></p></div>';
            panel.querySelector('.excalidraw-error').textContent = error?.message || 'Could not open this drawing.';
        }
    }
}

export function disposeExcalidrawTab(panel) {
    panel?._excalidrawSession?.dispose();
    if (!panel) return;
    panel._excalidrawSession = null;
    panel._excalidrawPath = null;
}

function mountExcalidrawEditor(panel, tab, vendor, scene) {
    panel.innerHTML = '<div class="excalidraw-view"><div class="excalidraw-stage" data-excalidraw-stage></div></div>';
    const stage = panel.querySelector('[data-excalidraw-stage]');
    const session = {
        savedVersion: null,
        latestVersion: null,
        saving: false,
        timer: null,
        editor: null,
        dispose: null,
    };

    function scheduleSave() {
        clearTimeout(session.timer);
        session.timer = setTimeout(() => save().catch(() => {}), excalidrawAutosaveMs);
    }

    async function save() {
        clearTimeout(session.timer);
        if (session.saving || session.latestVersion === session.savedVersion) return;
        session.saving = true;
        const version = session.latestVersion;
        try {
            const svg = await session.editor.exportSVG();
            const result = await workspace().saveFileSnapshot(tab, svg);
            if (!result?.success) throw new Error(result?.error || 'Could not save the drawing');
            session.savedVersion = version;
            workspace().refreshFileTree().catch(() => {});
        } catch (error) {
            log.error('Unable to save Excalidraw drawing:', error);
        } finally {
            session.saving = false;
        }
        // Edits made while the export was running still need a write.
        if (session.latestVersion !== session.savedVersion) scheduleSave();
    }

    session.editor = vendor.mount(stage, {
        scene,
        theme: editorTheme(),
        onChange: ({ version }) => {
            session.latestVersion = version;
            // Excalidraw reports the loaded scene once; that is the saved baseline.
            if (session.savedVersion === null) {
                session.savedVersion = version;
                return;
            }
            if (version === session.savedVersion) return;
            workspace().markTabDirty(tab.id);
            scheduleSave();
        },
    });

    const onAppearanceChanged = () => session.editor.setTheme(editorTheme());
    const onKeyDown = event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            event.stopPropagation();
            save().catch(() => {});
        }
    };
    document.addEventListener('figaro:appearance-changed', onAppearanceChanged);
    stage.addEventListener('keydown', onKeyDown, true);

    session.save = save;
    session.dispose = () => {
        clearTimeout(session.timer);
        document.removeEventListener('figaro:appearance-changed', onAppearanceChanged);
        stage.removeEventListener('keydown', onKeyDown, true);
        session.editor.unmount();
    };
    panel._excalidrawSession = session;
}
