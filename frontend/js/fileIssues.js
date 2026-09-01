import { backend } from './backend.js';
import { activateModal, createDialogShell, errorDialog } from './dialogs.js';
import { warningIcon } from './icons.js';
import { log } from './log.js';
import { getState, setState } from './state.js';
import {
    fileIssuesEqual,
    fileIssueSummary,
    groupedFileIssues,
    normalizeFileIssue,
    normalizeFileIssues,
    removeRuntimeFileIssue,
    replaceVaultFileIssues,
    upsertRuntimeFileIssue,
} from './core/fileIssueModel.js';

let initialized = false;
let refreshGeneration = 0;
let announcedSummary = '';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function currentIssues() {
    return normalizeFileIssues(getState('fileIssues'));
}

function renderStatusIndicator() {
    const button = document.getElementById('status-file-issues');
    const announcer = document.getElementById('status-file-issues-announcer');
    if (!button) return;
    const summary = fileIssueSummary(currentIssues());
    button.hidden = summary.count === 0;
    button.dataset.severity = summary.severity;
    button.classList.toggle('ui-button--warning', summary.count > 0 && summary.severity === 'warning');
    button.classList.toggle('ui-button--danger', summary.count > 0 && summary.severity === 'danger');
    button.setAttribute('aria-label', summary.ariaLabel || 'No file diagnostics');
    button.title = summary.text;
    button.innerHTML = summary.count
        ? `${warningIcon(12, 2)}<span>${escapeHtml(summary.text)}</span>`
        : '';
    document.getElementById('status-bar')?.setAttribute('data-file-issues', String(summary.count > 0));

    const announcement = summary.count ? summary.ariaLabel : '';
    if (announcer && announcement !== announcedSummary) {
        announcer.textContent = announcement;
        announcedSummary = announcement;
    }
}

function publishIssues(issues) {
    const current = currentIssues();
    const next = normalizeFileIssues(issues);
    if (fileIssuesEqual(current, next)) {
        renderStatusIndicator();
        return current;
    }
    setState('fileIssues', next);
    renderStatusIndicator();
    document.dispatchEvent(new CustomEvent('vault-file-issues-changed', {
        detail: { issues: next },
    }));
    return next;
}

export async function refreshFileIssues() {
    const generation = ++refreshGeneration;
    try {
        const issues = await backend().GetVaultFileIssues();
        if (generation !== refreshGeneration) return currentIssues();
        return publishIssues(replaceVaultFileIssues(currentIssues(), issues));
    } catch (error) {
        if (generation === refreshGeneration) log.warn('Could not refresh file diagnostics:', error);
        return currentIssues();
    }
}

export async function recheckFileIssues() {
    const generation = ++refreshGeneration;
    try {
        const issues = await backend().RecheckVaultFileIssues();
        if (generation !== refreshGeneration) return currentIssues();
        return publishIssues(replaceVaultFileIssues(currentIssues(), issues));
    } catch (error) {
        if (generation === refreshGeneration) {
            log.warn('Could not check file diagnostics:', error);
            await errorDialog('Couldn’t check files', error, 'No file was changed.');
        }
        return currentIssues();
    }
}

export function recordVaultFileIssue(rawIssue) {
    const issue = normalizeFileIssue(rawIssue, { source: 'vault' });
    if (!issue) return currentIssues();
    return publishIssues(replaceVaultFileIssues(currentIssues(), [
        ...currentIssues().filter(existing => existing.source === 'vault' && existing.path !== issue.path),
        issue,
    ]));
}

export function recordRuntimeFileIssue(rawIssue) {
    return publishIssues(upsertRuntimeFileIssue(currentIssues(), rawIssue));
}

export function resolveFileIssue(path, codes = []) {
    const normalizedPath = String(path || '').replaceAll('\\', '/');
    const codeSet = new Set(Array.isArray(codes) ? codes : [codes]);
    const next = currentIssues().filter(issue => !(
        issue.path === normalizedPath
        && (issue.source === 'vault' || !codeSet.size || codeSet.has(issue.code))
    ));
    return publishIssues(next);
}

export function resolveVaultFileIssue(path) {
    const normalizedPath = String(path || '').replaceAll('\\', '/');
    return publishIssues(currentIssues().filter(issue => !(
        issue.source === 'vault' && issue.path === normalizedPath
    )));
}

export function resolveRuntimeFileIssue(path, codes = []) {
    return publishIssues(removeRuntimeFileIssue(currentIssues(), path, codes));
}

function resolveRuntimeFileIssuesBelow(path) {
    const prefix = String(path || '').replaceAll('\\', '/');
    if (!prefix) return currentIssues();
    return publishIssues(currentIssues().filter(issue => !(
        issue.source === 'runtime'
        && (issue.path === prefix || issue.path.startsWith(`${prefix}/`))
    )));
}

function remapRuntimeFileIssues(oldPath, newPath) {
    const source = String(oldPath || '').replaceAll('\\', '/');
    const destination = String(newPath || '').replaceAll('\\', '/');
    if (!source || !destination) return currentIssues();
    return publishIssues(currentIssues().map(issue => (
        issue.source === 'runtime'
        && (issue.path === source || issue.path.startsWith(`${source}/`))
            ? { ...issue, path: destination + issue.path.slice(source.length) }
            : issue
    )));
}

async function openWithDefaultApplication(path, externalFileId = '') {
    try {
        const result = externalFileId
            ? await backend().OpenLaunchExternalFile(externalFileId)
            : await backend().OpenWithDefaultApplication(path);
        if (!result?.success) throw new Error(result?.error || 'The operating system did not accept the file.');
    } catch (error) {
        await errorDialog('Couldn’t open file', error, 'The file was not changed.');
    }
}

async function revealInFileManager(path, externalFileId = '') {
    try {
        const result = externalFileId
            ? await backend().RevealLaunchExternalFile(externalFileId)
            : await backend().RevealInExplorer(path);
        if (!result?.success) throw new Error(result?.error || 'The file manager could not reveal this location.');
    } catch (error) {
        await errorDialog('Couldn’t reveal file', error, 'The file was not changed.');
    }
}

function issueCardHTML(issue, index) {
    const paths = issue.paths || [issue.path];
    const pathsHTML = paths.map(path => `<code title="${escapeHtml(path)}">${escapeHtml(path)}</code>`).join('');
    const path = paths.find(candidate => !candidate.split('/').some(part => part.startsWith('.')))
        || paths[0]
        || issue.path;
    const hiddenPath = !issue.externalFileId && path.split('/').some(part => part.startsWith('.'));
    const canOpenExternally = ['too_large', 'binary', 'unsupported_encoding', 'unreadable'].includes(issue.code);
    const externalFileId = escapeHtml(issue.externalFileId || '');
    return `
        <article class="ui-notice ui-notice--${issue.severity === 'danger' ? 'danger' : 'warning'} file-issue-card" data-issue-index="${index}">
            <div class="file-issue-card-heading">
                <span class="file-issue-severity">${issue.severity === 'danger' ? 'Action required' : 'Needs attention'}</span>
                <h4>${escapeHtml(issue.title)}</h4>
            </div>
            <div class="file-issue-paths">${pathsHTML}</div>
            <p>${escapeHtml(issue.detail)}</p>
            <p class="file-issue-guidance"><strong>What to do:</strong> ${escapeHtml(issue.guidance)}</p>
            <div class="file-issue-actions">
                ${hiddenPath ? '' : `<button type="button" class="ui-button ui-button--quiet" data-file-issue-action="show" data-path="${escapeHtml(path)}">Show in file tree</button>`}
                ${canOpenExternally ? `<button type="button" class="ui-button ui-button--quiet" data-file-issue-action="open" data-path="${escapeHtml(path)}" data-external-file-id="${externalFileId}">Open externally</button>` : ''}
                <button type="button" class="ui-button ui-button--quiet" data-file-issue-action="reveal" data-path="${escapeHtml(path)}" data-external-file-id="${externalFileId}">Reveal in folder</button>
            </div>
        </article>
    `;
}

export function showFileIssues({ path = '' } = {}) {
    const groups = groupedFileIssues(currentIssues(), path);
    if (!groups.length) return Promise.resolve(false);
    const canRecheck = groups.some(issue => issue.source === 'vault');

    return new Promise(resolve => {
        const { overlay } = createDialogShell({
            title: 'Files need attention',
            description: 'Figaro left these files unchanged. Review each diagnosis and choose the safest recovery action.',
            tone: groups.some(issue => issue.severity === 'danger') ? 'danger' : 'warning',
            icon: 'warning',
            className: 'file-issues-modal',
            content: `<div class="file-issue-list">${groups.map(issueCardHTML).join('')}</div>`,
            footer: `
                ${canRecheck ? '<button type="button" class="ui-button custom-modal-btn file-issues-recheck">Check again</button>' : ''}
                <button type="button" class="ui-button ui-button--primary custom-modal-btn custom-modal-btn-confirm">Close</button>
            `,
        });
        const closeButton = overlay.querySelector('.custom-modal-btn-confirm');
        const recheckButton = overlay.querySelector('.file-issues-recheck');
        let lifecycle = null;
        const settle = (value, restoreFocus = true) => {
            if (!lifecycle.close(restoreFocus)) return;
            resolve(value);
        };
        lifecycle = activateModal(overlay, {
            initialFocus: closeButton,
            onDismiss: () => resolve(false),
        });
        closeButton.addEventListener('click', () => settle(true));
        recheckButton?.addEventListener('click', async () => {
            recheckButton.disabled = true;
            recheckButton.textContent = 'Checking…';
            const next = await recheckFileIssues();
            settle(next.length === 0);
            if (next.length) showFileIssues({ path });
        });
        overlay.querySelector('.file-issue-list').addEventListener('click', event => {
            const action = event.target.closest('[data-file-issue-action]');
            if (!action) return;
            const targetPath = action.dataset.path || '';
            const externalFileId = action.dataset.externalFileId || '';
            const kind = action.dataset.fileIssueAction;
            settle(true, false);
            if (kind === 'show') {
                document.dispatchEvent(new CustomEvent('vault-file-issue-reveal-requested', {
                    detail: { path: targetPath },
                }));
            } else if (kind === 'open') {
                void openWithDefaultApplication(targetPath, externalFileId);
            } else if (kind === 'reveal') {
                void revealInFileManager(targetPath, externalFileId);
            }
        });
    });
}

export function initFileIssues() {
    if (initialized) return false;
    const button = document.getElementById('status-file-issues');
    if (!button) return false;
    initialized = true;
    button.addEventListener('click', () => { void showFileIssues(); });
    document.addEventListener('vault-file-issues-open-requested', event => {
        void showFileIssues({ path: String(event.detail?.path || '') });
    });
    document.addEventListener('vault-file-issue-runtime-clear-requested', event => {
        resolveRuntimeFileIssuesBelow(String(event.detail?.path || ''));
    });
    document.addEventListener('vault-file-issue-runtime-remap-requested', event => {
        remapRuntimeFileIssues(
            String(event.detail?.oldPath || ''),
            String(event.detail?.newPath || ''),
        );
    });
    renderStatusIndicator();
    return true;
}
