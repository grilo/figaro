/**
 * Lightweight diagrams.net integration for editable SVG diagrams.
 *
 * The editor is hosted by diagrams.net, while Figaro stores only the resulting
 * self-contained .drawio.svg file in the vault. That file remains a regular
 * SVG image when the editor is unavailable or the user is offline.
 */

import { log } from './log.js';
import { errorDialog } from './dialogs.js';

export const drawioEditorOrigin = 'https://embed.diagrams.net';
const drawioEditorURL = `${drawioEditorOrigin}/?embed=1&proto=json&spin=1&ui=atlas&libraries=1&saveAndExit=1`;

export function isDrawioDiagramPath(path) {
    return /\.drawio\.svg$/i.test(String(path || ''));
}

export function encodeDrawioSVG(svg) {
    if (!svg) return '';
    return `data:image/svg+xml;base64,${base64Encode(svg)}`;
}

export function decodeDrawioSVG(data) {
    const value = String(data || '');
    if (!value) return '';
    if (!value.startsWith('data:')) return value;

    const separator = value.indexOf(',');
    if (separator < 0) throw new Error('Draw.io returned an invalid SVG payload');
    const header = value.slice(0, separator).toLowerCase();
    const payload = value.slice(separator + 1);
    return header.includes(';base64') ? base64Decode(payload) : decodeURIComponent(payload);
}

export async function renderDrawioTab(panel, tab) {
    if (!panel || !tab?.path) return;
    if (panel._drawioPath === tab.path && (panel._drawioSession || panel._drawioPreview)) return;

    disposeDrawioTab(panel);
    const requestId = (panel._drawioRequestId || 0) + 1;
    panel._drawioRequestId = requestId;
    panel._drawioPath = tab.path;
    panel.innerHTML = `<div class="drawio-view"><div class="drawio-loading">Loading ${escapeHtml(tab.title || 'diagram')}…</div></div>`;

    try {
        const result = await window.pywebview.api.read_diagram(tab.path);
        if (!panel.isConnected || panel._drawioRequestId !== requestId || panel._drawioPath !== tab.path) return;
        if (!result) throw new Error('Diagram file was not found');

        tab.mtime = result.mtime;
        mountDrawioEditor(panel, tab, result.content || '');
    } catch (error) {
        log.error('Unable to open draw.io diagram:', error);
        if (panel.isConnected && panel._drawioRequestId === requestId) {
            panel.innerHTML = `<div class="drawio-view"><div class="drawio-error">${escapeHtml(error?.message || 'Could not open this diagram.')}</div></div>`;
        }
    }
}

export function disposeDrawioTab(panel) {
    const session = panel?._drawioSession;
    session?.dispose?.();
    if (!panel) return;
    panel._drawioSession = null;
    panel._drawioPreview = null;
    panel._drawioPath = null;
}

function mountDrawioEditor(panel, tab, sourceSVG) {
    const existing = panel._drawioSession;
    existing?.dispose?.();
    panel._drawioPreview = null;
    panel._drawioPath = tab.path;

    panel.innerHTML = `
        <div class="drawio-view">
            <div class="drawio-toolbar">
                <span class="drawio-title">${escapeHtml(tab.title || tab.path.split('/').pop())}</span>
                <span class="drawio-status" data-drawio-status>Connecting to diagrams.net…</span>
            </div>
            <iframe class="drawio-frame" title="Draw.io editor" src="${drawioEditorURL}" allow="clipboard-read; clipboard-write"></iframe>
        </div>`;

    const frame = panel.querySelector('.drawio-frame');
    const status = panel.querySelector('[data-drawio-status]');
    const session = {
        frame,
        sourceSVG,
        latestSVG: sourceSVG,
        saving: false,
        exitAfterSave: false,
        disposed: false,
        post(message) {
            frame.contentWindow?.postMessage(JSON.stringify(message), drawioEditorOrigin);
        },
        setStatus(message) {
            if (status) status.textContent = message;
        },
        dispose() {
            if (session.disposed) return;
            session.disposed = true;
            clearTimeout(session.connectTimeout);
            window.removeEventListener('message', receiveMessage);
            frame.remove();
        },
    };
    panel._drawioSession = session;

    const receiveMessage = (event) => {
        if (session.disposed || event.origin !== drawioEditorOrigin || event.source !== frame.contentWindow) return;
        const message = parseDrawioMessage(event.data);
        if (!message) return;

        if (message.event === 'init') {
            session.initialised = true;
            session.setStatus('Editing locally; saving as SVG…');
            session.post({
                action: 'load',
                xml: encodeDrawioSVG(session.sourceSVG),
                autosave: 1,
                saveAndExit: 1,
                title: tab.title || tab.path.split('/').pop(),
                fit: 1,
            });
            return;
        }

        if (message.event === 'autosave') {
            if (!session.saving) {
                import('./tabManager.js').then(({ markTabDirty }) => markTabDirty(tab.id)).catch(() => {});
            }
            return;
        }

        if (message.event === 'save') {
            requestSVGExport(panel, tab, session, message.xml, Boolean(message.exit));
            return;
        }

        if (message.event === 'export') {
            persistExportedSVG(panel, tab, session, message.data);
            return;
        }

        if (message.event === 'exit') {
            if (session.saving) {
                session.exitAfterSave = true;
            } else {
                showDiagramPreview(panel, tab, session.latestSVG);
            }
            return;
        }

        if (message.event === 'error') {
            session.setStatus(message.message || 'Draw.io reported an error');
        }
    };
    window.addEventListener('message', receiveMessage);

    session.connectTimeout = setTimeout(() => {
        if (!session.disposed && !session.initialised) {
            session.setStatus('Waiting for diagrams.net. Check your internet connection.');
        }
    }, 12000);
}

function requestSVGExport(panel, tab, session, xml, exitAfterSave) {
    if (session.disposed || session.saving) return;
    session.saving = true;
    session.exitAfterSave = exitAfterSave;
    session.setStatus('Exporting editable SVG…');
    session.post({ action: 'spinner', message: 'Saving', show: 1 });
    session.post({
        action: 'export',
        format: 'xmlsvg',
        xml: xml || '',
        embedImages: true,
        spinKey: 'export',
    });
}

async function persistExportedSVG(panel, tab, session, data) {
    if (session.disposed || !session.saving) return;

    try {
        const svg = decodeDrawioSVG(data);
        if (!/<svg[\s>]/i.test(svg)) throw new Error('Draw.io did not return SVG output');

        const { saveFileSnapshot } = await import('./tabManager.js');
        const result = await saveFileSnapshot(tab, svg);
        if (!result?.success) throw new Error(result?.error || 'Could not save the diagram');

        session.latestSVG = svg;
        session.sourceSVG = svg;
        session.saving = false;
        session.setStatus('Saved');
        session.post({ action: 'spinner', show: 0 });
        session.post({ action: 'status', messageKey: 'allChangesSaved', modified: false });
        import('./fileTree.js').then(({ refreshFileTree }) => refreshFileTree()).catch(() => {});

        if (session.exitAfterSave) showDiagramPreview(panel, tab, svg);
    } catch (error) {
        session.saving = false;
        session.setStatus('Save failed');
        session.post({ action: 'spinner', show: 0 });
        log.error('Unable to save draw.io SVG:', error);
        await errorDialog('Couldn’t save diagram', error, 'The diagram could not be saved.');
    }
}

function showDiagramPreview(panel, tab, svg) {
    const session = panel._drawioSession;
    session?.dispose?.();
    panel._drawioSession = null;
    panel._drawioPath = tab.path;
    panel._drawioPreview = svg;

    const preview = svg
        ? `<img class="drawio-preview-image" alt="${escapeAttr(tab.title || 'Draw.io diagram')}" src="${encodeDrawioSVG(svg)}">`
        : '<p class="drawio-preview-empty">This diagram has no shapes yet.</p>';
    panel.innerHTML = `
        <div class="drawio-view drawio-preview">
            <div class="drawio-toolbar">
                <span class="drawio-title">${escapeHtml(tab.title || tab.path.split('/').pop())}</span>
                <button type="button" class="drawio-edit-button">Edit diagram</button>
            </div>
            <div class="drawio-preview-canvas">${preview}</div>
        </div>`;
    panel.querySelector('.drawio-edit-button')?.addEventListener('click', () => {
        mountDrawioEditor(panel, tab, svg);
    });
}

function parseDrawioMessage(data) {
    if (typeof data === 'object' && data) return data;
    if (typeof data !== 'string' || !data) return null;
    try {
        return JSON.parse(data);
    } catch (_) {
        return null;
    }
}

function base64Encode(value) {
    if (typeof TextEncoder === 'undefined') {
        return btoa(encodeURIComponent(String(value)).replace(/%([0-9A-F]{2})/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16))));
    }
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64Decode(value) {
    const binary = atob(value);
    if (typeof TextDecoder === 'undefined') {
        return decodeURIComponent([...binary]
            .map(char => '%' + char.charCodeAt(0).toString(16).padStart(2, '0'))
            .join(''));
    }
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = String(value || '');
    return node.innerHTML;
}

function escapeAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
