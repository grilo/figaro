import { backend } from './backend.js';
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
export const drawioExportTimeoutMs = 30000;
const drawioDebugStorageKey = 'figaro.drawio.debug';
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
        const result = await backend().ReadDiagram(tab.path);
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
        exportTimeout: null,
        disposed: false,
        post(message) {
            traceDrawio('sent', message);
            frame.contentWindow?.postMessage(JSON.stringify(message), drawioEditorOrigin);
        },
        setStatus(message) {
            if (status) status.textContent = message;
        },
        dispose() {
            if (session.disposed) return;
            session.disposed = true;
            clearTimeout(session.connectTimeout);
            clearDrawioExportTimeout(session);
            window.removeEventListener('message', receiveMessage);
            frame.remove();
        },
    };
    panel._drawioSession = session;

    const receiveMessage = (event) => {
        const message = parseDrawioMessage(event.data);
        if (!message) return;
        if (session.disposed) {
            traceDrawio('ignored disposed message', message);
            return;
        }
        if (event.origin !== drawioEditorOrigin) {
            traceDrawio('ignored origin', { ...message, origin: event.origin });
            return;
        }
        if (event.source !== frame.contentWindow) {
            traceDrawio('ignored source', message);
            return;
        }
        traceDrawio('received', message);

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
            const error = new Error(message.message || 'Draw.io could not export the diagram');
            if (session.saving) {
                reportDrawioSaveFailure(session, error).catch(failure => {
                    log.error('Unable to report draw.io save failure:', failure);
                });
            } else {
                session.setStatus(error.message);
            }
        }
    };
    window.addEventListener('message', receiveMessage);

    session.connectTimeout = setTimeout(() => {
        if (!session.disposed && !session.initialised) {
            session.setStatus('Waiting for diagrams.net. Check your internet connection.');
        }
    }, 12000);
}

function requestSVGExport(panel, tab, session, _xml, exitAfterSave) {
    if (session.disposed || session.saving) return;
    session.saving = true;
    session.exitAfterSave = exitAfterSave;
    session.setStatus('Exporting editable SVG…');
    session.post({
        action: 'export',
        format: 'xmlsvg',
        embedImages: true,
        spinKey: 'saving',
    });
    session.exportTimeout = setTimeout(() => {
        if (session.disposed || !session.saving) return;
        traceDrawio('timeout', { action: 'export', timeoutMs: drawioExportTimeoutMs });
        reportDrawioSaveFailure(session, new Error('The diagram editor did not finish exporting. Try Save again.')).catch(error => {
            log.error('Unable to report draw.io export timeout:', error);
        });
    }, drawioExportTimeoutMs);
}

async function persistExportedSVG(panel, tab, session, data) {
    if (session.disposed || !session.saving) return;
    clearDrawioExportTimeout(session);

    try {
        const svg = decodeDrawioSVG(data);
        if (!/<svg[\s>]/i.test(svg)) throw new Error('Draw.io did not return SVG output');
        traceDrawio('persisting SVG', { bytes: svg.length, path: tab.path });

        const { saveFileSnapshot } = await import('./tabManager.js');
        const result = await saveFileSnapshot(tab, svg);
        if (!result?.success) throw new Error(result?.error || 'Could not save the diagram');

        session.latestSVG = svg;
        session.sourceSVG = svg;
        session.saving = false;
        session.setStatus('Saved');
        session.post({ action: 'spinner', show: 0 });
        session.post({ action: 'status', messageKey: 'allChangesSaved', modified: false });
        traceDrawio('saved SVG', { bytes: svg.length, path: tab.path });
        import('./fileTree.js').then(({ refreshFileTree }) => refreshFileTree()).catch(() => {});

        if (session.exitAfterSave) showDiagramPreview(panel, tab, svg);
    } catch (error) {
        await reportDrawioSaveFailure(session, error);
    }
}

function clearDrawioExportTimeout(session) {
    if (session?.exportTimeout == null) return;
    clearTimeout(session.exportTimeout);
    session.exportTimeout = null;
}

/**
 * Return control to diagrams.net after a failed export so its normal Save
 * button remains a usable retry. This handles both explicit protocol errors
 * and an interrupted or missing export response.
 */
async function reportDrawioSaveFailure(session, error) {
    if (session.disposed || !session.saving) return;
    clearDrawioExportTimeout(session);
    session.saving = false;
    session.exitAfterSave = false;
    session.setStatus('Save failed — try Save again');
    session.post({ action: 'spinner', show: false });
    traceDrawio('save failed', { message: error?.message || String(error) });
    log.error('Unable to save draw.io SVG:', error);
    await errorDialog('Couldn’t save diagram', error, 'The diagram could not be saved.');
}

/**
 * Enable temporary protocol diagnostics from a WebKit/Chromium console with
 * `window.__figaroDrawioDebug = true`, or persist it across reloads with
 * `localStorage.setItem('figaro.drawio.debug', 'true')`. Payload contents are
 * deliberately omitted: diagram data can be large and belongs only in vault
 * files, not application logs.
 */
function traceDrawio(stage, message = {}) {
    if (!drawioDebugEnabled()) return;
    const summary = {
        event: message.event,
        action: message.action,
        format: message.format,
        show: message.show,
        exit: message.exit,
        message: message.message,
        xmlBytes: typeof message.xml === 'string' ? message.xml.length : undefined,
        dataBytes: typeof message.data === 'string' ? message.data.length : undefined,
        timeoutMs: message.timeoutMs,
        path: message.path,
        bytes: message.bytes,
    };
    const trace = window.__figaroDrawioProtocolTrace || (window.__figaroDrawioProtocolTrace = []);
    trace.push({ at: new Date().toISOString(), stage, ...summary });
    if (trace.length > 100) trace.splice(0, trace.length - 100);
    log.debug(`[draw.io] ${stage} ${JSON.stringify(summary)}`);
}

function drawioDebugEnabled() {
    try {
        return window.__figaroDrawioDebug === true || window.localStorage?.getItem(drawioDebugStorageKey) === 'true';
    } catch (_) {
        return window.__figaroDrawioDebug === true;
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
