/**
 * Application dialogs.
 *
 * Every modal uses the same shell, focus lifecycle, keyboard behavior, and
 * action hierarchy. Purpose-built flows (rename, new file, merge, PDF
 * recovery) add their own content without bypassing those foundations.
 */

import { analyzeTabularText, markdownTableFromRows } from './markdownTableConversion.js';

let activeModal = null;
let activeModalDismiss = null;
let dialogSequence = 0;

const focusableSelector = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

const dialogIcons = {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.35 2.35 0 1 1 3.52 2.03c-.82.48-1.32.92-1.32 1.97"/><path d="M12 17h.01"/>',
    warning: '<path d="m10.3 3.86-8.04 13.5A2 2 0 0 0 3.98 20h16.04a2 2 0 0 0 1.72-3.03l-8.04-13.1a2 2 0 0 0-3.4-.01Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    'file-add': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 12v6M9 15h6"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 13h8l1-13"/><path d="M10 11v5M14 11v5"/>',
    merge: '<path d="M7 4v3a5 5 0 0 0 5 5h5"/><path d="m14 9 3 3-3 3"/><path d="M7 20v-3a5 5 0 0 1 5-5"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16M15 4v16"/>',
};

function iconSVG(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${dialogIcons[name] || dialogIcons.info}</svg>`;
}

function createDialogShell({ title, description = '', tone = 'neutral', icon = 'info', className = '', content = '', footer = '' }) {
    closeActiveModal(false);
    const id = `figaro-dialog-${++dialogSequence}`;
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
        <section class="custom-modal custom-modal--${escapeHtml(tone)} ${escapeHtml(className)}" role="dialog" aria-modal="true" aria-labelledby="${id}-title" ${description ? `aria-describedby="${id}-description"` : ''} tabindex="-1">
            <header class="custom-modal-header">
                <span class="custom-modal-icon" aria-hidden="true">${iconSVG(icon)}</span>
                <div class="custom-modal-heading">
                    <h3 id="${id}-title">${escapeHtml(title)}</h3>
                    ${description ? `<p id="${id}-description">${escapeHtml(description)}</p>` : ''}
                </div>
            </header>
            ${content ? `<div class="custom-modal-content">${content}</div>` : ''}
            ${footer ? `<footer class="custom-modal-buttons">${footer}</footer>` : ''}
        </section>
    `;
    document.body.appendChild(overlay);
    return { overlay, modal: overlay.querySelector('.custom-modal') };
}

function activateModal(overlay, { initialFocus, onDismiss, dismissOnBackdrop = true, onKeydown } = {}) {
    const modal = overlay.querySelector('.custom-modal');
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const application = document.getElementById('app');
    const applicationWasInert = application?.hasAttribute('inert') || false;
    let closed = false;

    if (application && !application.contains(overlay)) application.setAttribute('inert', '');
    document.body.classList.add('custom-modal-open');

    const close = (restoreFocus = true) => {
        if (closed) return false;
        closed = true;
        document.removeEventListener('keydown', handleKeydown, true);
        overlay.remove();
        if (application && !applicationWasInert) application.removeAttribute('inert');
        if (activeModal === overlay) {
            activeModal = null;
            activeModalDismiss = null;
            document.body.classList.remove('custom-modal-open');
        }
        if (restoreFocus && previousFocus?.isConnected) setTimeout(() => previousFocus.focus(), 0);
        return true;
    };

    const dismiss = (restoreFocus = true) => {
        if (!close(restoreFocus)) return;
        onDismiss?.();
    };

    const handleKeydown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            dismiss();
            return;
        }
        if (event.key === 'Tab') {
            const focusable = [...modal.querySelectorAll(focusableSelector)]
                .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
            if (!focusable.length) {
                event.preventDefault();
                modal.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
        onKeydown?.(event, dismiss);
    };

    if (dismissOnBackdrop) {
        overlay.addEventListener('mousedown', event => {
            if (event.target === overlay) dismiss();
        });
    }
    document.addEventListener('keydown', handleKeydown, true);
    activeModal = overlay;
    activeModalDismiss = dismiss;
    setTimeout(() => {
        const target = typeof initialFocus === 'function' ? initialFocus() : initialFocus;
        (target || modal).focus();
    }, 0);
    return { close, dismiss };
}

/**
 * Show a confirmation dialog. The legacy return values are retained because
 * the three-action exit flow distinguishes `confirm` from `extra`.
 */
export function confirmDialog(title, message, isDanger = false, html = false, options = {}) {
    return new Promise(resolve => {
        const confirmLabel = options.confirmLabel || (isDanger ? 'Delete' : 'Confirm');
        const cancelLabel = options.cancelLabel || 'Cancel';
        const extraLabel = options.extraLabel || '';
        const tone = options.tone || (isDanger ? 'danger' : 'neutral');
        const icon = options.icon || (isDanger ? 'trash' : tone === 'warning' ? 'warning' : 'question');
        const extraClass = options.extraDanger ? 'custom-modal-btn-danger-ghost' : 'custom-modal-btn-extra';
        const { overlay } = createDialogShell({
            title,
            description: options.description || '',
            tone,
            icon,
            content: `<div class="custom-modal-body">${html ? message : escapeHtml(message)}</div>`,
            footer: `
                ${extraLabel ? `<button type="button" class="custom-modal-btn ${extraClass}">${escapeHtml(extraLabel)}</button><span class="custom-modal-button-spacer"></span>` : ''}
                <button type="button" class="custom-modal-btn custom-modal-btn-cancel">${escapeHtml(cancelLabel)}</button>
                <button type="button" class="custom-modal-btn ${isDanger ? 'custom-modal-btn-delete' : 'custom-modal-btn-confirm'}">${escapeHtml(confirmLabel)}</button>
            `,
        });
        const cancelButton = overlay.querySelector('.custom-modal-btn-cancel');
        const confirmButton = overlay.querySelector('.custom-modal-btn-confirm, .custom-modal-btn-delete');
        const extraButton = overlay.querySelector(`.${extraClass}`);
        let lifecycle = null;
        const settle = (value, restoreFocus = true) => {
            if (!lifecycle.close(restoreFocus)) return;
            resolve(value);
        };
        lifecycle = activateModal(overlay, {
            initialFocus: isDanger ? cancelButton : confirmButton,
            onDismiss: () => resolve(false),
        });
        cancelButton.addEventListener('click', () => settle(false));
        confirmButton.addEventListener('click', () => settle('confirm'));
        extraButton?.addEventListener('click', () => settle('extra'));
    });
}

/** Show an acknowledgement-only application message. */
export function messageDialog(title, message, options = {}) {
    return new Promise(resolve => {
        const tone = options.tone || 'info';
        const { overlay } = createDialogShell({
            title,
            description: options.description || '',
            tone,
            icon: options.icon || (tone === 'danger' ? 'error' : tone === 'warning' ? 'warning' : 'info'),
            content: `<div class="custom-modal-body">${escapeHtml(message)}</div>`,
            footer: `<button type="button" class="custom-modal-btn custom-modal-btn-confirm">${escapeHtml(options.acknowledgementLabel || 'Got it')}</button>`,
        });
        const button = overlay.querySelector('.custom-modal-btn-confirm');
        let lifecycle = null;
        const settle = (restoreFocus = true) => {
            if (!lifecycle.close(restoreFocus)) return;
            resolve();
        };
        lifecycle = activateModal(overlay, {
            initialFocus: button,
            onDismiss: resolve,
            onKeydown: event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    settle();
                }
            },
        });
        button.addEventListener('click', () => settle());
    });
}

/** Present an error using the same in-app message treatment everywhere. */
export function errorDialog(title, error, fallback = 'Something went wrong.') {
    const message = String(error?.message || error || fallback).trim() || fallback;
    return messageDialog(title, message, { tone: 'danger', icon: 'error', acknowledgementLabel: 'Close' });
}

/** Show a labelled, validated text prompt. */
export function promptDialog(title, message, defaultValue = '', options = {}) {
    return new Promise(resolve => {
        const id = `prompt-${dialogSequence + 1}`;
        const { overlay } = createDialogShell({
            title,
            description: message,
            tone: options.tone || 'neutral',
            icon: options.icon || 'edit',
            className: 'prompt-modal',
            content: `
                <form id="${id}-form" class="custom-modal-form">
                    ${options.context ? `<div class="custom-modal-context"><span>${escapeHtml(options.contextLabel || 'Location')}</span><code title="${escapeHtml(options.context)}">${escapeHtml(options.context)}</code></div>` : ''}
                    <label class="custom-modal-field" for="${id}-input">${escapeHtml(options.label || 'Name')}</label>
                    <input id="${id}-input" type="text" class="custom-modal-input" value="${escapeHtml(defaultValue)}" autocomplete="off" spellcheck="false" aria-describedby="${id}-help ${id}-error">
                    <p class="custom-modal-help" id="${id}-help">${escapeHtml(options.help || '')}</p>
                    <p class="custom-modal-error" id="${id}-error" role="alert" hidden></p>
                </form>
            `,
            footer: `
                <button type="button" class="custom-modal-btn custom-modal-btn-cancel">${escapeHtml(options.cancelLabel || 'Cancel')}</button>
                <button type="submit" form="${id}-form" class="custom-modal-btn custom-modal-btn-confirm">${escapeHtml(options.confirmLabel || 'OK')}</button>
            `,
        });
        const form = overlay.querySelector('form');
        const input = overlay.querySelector('.custom-modal-input');
        const error = overlay.querySelector('.custom-modal-error');
        const cancelButton = overlay.querySelector('.custom-modal-btn-cancel');
        let lifecycle = null;
        const showError = messageText => {
            error.textContent = messageText;
            error.hidden = false;
            input.setAttribute('aria-invalid', 'true');
            input.focus();
        };
        const validate = () => {
            const validation = options.validate?.(input.value);
            if (typeof validation === 'string' && validation) {
                showError(validation);
                return false;
            }
            return true;
        };
        const settle = (value, restoreFocus = true) => {
            if (!lifecycle.close(restoreFocus)) return;
            resolve(value);
        };
        const submit = () => {
            if (validate()) settle(input.value);
        };
        lifecycle = activateModal(overlay, {
            initialFocus: input,
            dismissOnBackdrop: false,
            onDismiss: () => resolve(null),
            onKeydown: event => {
                if (event.key === 'Enter' && document.activeElement === input) {
                    event.preventDefault();
                    submit();
                }
            },
        });
        input.addEventListener('input', () => {
            error.hidden = true;
            input.removeAttribute('aria-invalid');
        });
        form.addEventListener('submit', event => {
            event.preventDefault();
            submit();
        });
        cancelButton.addEventListener('click', () => settle(null));
        setTimeout(() => input.select(), 0);
    });
}

/** Preview and confirm conversion of selected delimited text to Markdown. */
export function tableConversionDialog(sourceText) {
    return new Promise(resolve => {
        const id = `table-conversion-${dialogSequence + 1}`;
        const { overlay } = createDialogShell({
            title: 'Convert selection to table',
            description: 'Review the detected rows before replacing the selected text.',
            tone: 'neutral',
            icon: 'table',
            className: 'table-conversion-modal',
            content: `
                <form id="${id}-form" class="table-conversion-form">
                    <div class="table-conversion-options">
                        <label class="table-conversion-field" for="${id}-delimiter">
                            <span>Delimiter</span>
                            <select id="${id}-delimiter" class="table-conversion-select">
                                <option value="auto">Detect automatically</option>
                                <option value="tab">Tab</option>
                                <option value="comma">Comma</option>
                                <option value="pipe">Pipe</option>
                            </select>
                        </label>
                        <label class="table-conversion-checkbox">
                            <input type="checkbox" checked>
                            <span>First row is header</span>
                        </label>
                    </div>
                    <p class="table-conversion-summary" aria-live="polite"></p>
                    <pre class="table-conversion-preview" tabindex="0" aria-label="Markdown table preview"></pre>
                    <p class="custom-modal-error table-conversion-error" role="alert" hidden></p>
                </form>
            `,
            footer: `
                <button type="button" class="custom-modal-btn custom-modal-btn-cancel">Cancel</button>
                <button type="submit" form="${id}-form" class="custom-modal-btn custom-modal-btn-confirm">Convert</button>
            `,
        });
        const form = overlay.querySelector('form');
        const delimiter = overlay.querySelector('.table-conversion-select');
        const firstRowHeader = overlay.querySelector('.table-conversion-checkbox input');
        const summary = overlay.querySelector('.table-conversion-summary');
        const preview = overlay.querySelector('.table-conversion-preview');
        const error = overlay.querySelector('.table-conversion-error');
        const cancelButton = overlay.querySelector('.custom-modal-btn-cancel');
        const confirmButton = overlay.querySelector('.custom-modal-btn-confirm');
        let lifecycle = null;
        let convertedMarkdown = '';

        const refresh = () => {
            const analysis = analyzeTabularText(sourceText, { delimiter: delimiter.value });
            if (!analysis.ok || analysis.alreadyMarkdown) {
                const message = analysis.alreadyMarkdown
                    ? 'The selection is already a Markdown table.'
                    : analysis.error;
                convertedMarkdown = '';
                summary.textContent = '';
                preview.textContent = '';
                preview.hidden = true;
                error.textContent = message;
                error.hidden = false;
                confirmButton.disabled = true;
                return;
            }
            convertedMarkdown = markdownTableFromRows(analysis.rows, {
                firstRowIsHeader: firstRowHeader.checked,
            });
            summary.textContent = `${analysis.delimiterLabel} detected · ${analysis.rows.length} rows × ${analysis.columns} columns`;
            preview.textContent = convertedMarkdown;
            preview.hidden = false;
            error.hidden = true;
            confirmButton.disabled = false;
        };
        const settle = (value, restoreFocus = true) => {
            if (!lifecycle.close(restoreFocus)) return;
            resolve(value);
        };

        lifecycle = activateModal(overlay, {
            initialFocus: cancelButton,
            dismissOnBackdrop: false,
            onDismiss: () => resolve(null),
        });
        delimiter.addEventListener('change', refresh);
        firstRowHeader.addEventListener('change', refresh);
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (convertedMarkdown) settle(convertedMarkdown);
        });
        cancelButton.addEventListener('click', () => settle(null));
        refresh();
    });
}

/** Purpose-built file-tree rename flow with inline validation and context. */
export function renamePathDialog(path, type) {
    return new Promise(resolve => {
        const normalizedPath = String(path || '').replaceAll('\\', '/');
        const oldName = normalizedPath.split('/').pop() || normalizedPath;
        const parent = normalizedPath.includes('/') ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) + '/' : 'Vault root';
        const kind = type === 'directory' ? 'folder' : 'file';
        const id = `rename-${dialogSequence + 1}`;
        const { overlay } = createDialogShell({
            title: `Rename ${kind}`,
            description: `Choose a new name for “${oldName}”. The item stays in its current folder.`,
            tone: 'neutral',
            icon: type === 'directory' ? 'folder' : 'edit',
            className: 'rename-modal',
            content: `
                <form id="${id}-form" class="custom-modal-form">
                    <div class="custom-modal-context"><span>Current location</span><code title="${escapeHtml(parent)}">${escapeHtml(parent)}</code></div>
                    <label class="custom-modal-field" for="${id}-input">New name</label>
                    <input id="${id}-input" class="custom-modal-input" type="text" value="${escapeHtml(oldName)}" autocomplete="off" spellcheck="false" aria-describedby="${id}-help ${id}-error">
                    <p class="custom-modal-help" id="${id}-help">Links to this ${kind} are updated automatically.</p>
                    <p class="custom-modal-error" id="${id}-error" role="alert" hidden></p>
                </form>
            `,
            footer: `
                <button type="button" class="custom-modal-btn custom-modal-btn-cancel">Cancel</button>
                <button type="submit" form="${id}-form" class="custom-modal-btn custom-modal-btn-confirm" disabled>Rename</button>
            `,
        });
        const form = overlay.querySelector('form');
        const input = overlay.querySelector('.custom-modal-input');
        const error = overlay.querySelector('.custom-modal-error');
        const cancelButton = overlay.querySelector('.custom-modal-btn-cancel');
        const confirmButton = overlay.querySelector('.custom-modal-btn-confirm');
        let lifecycle = null;
        const validationMessage = value => {
            const name = String(value || '').trim();
            if (!name) return `Enter a name for the ${kind}.`;
            if (/[\\/]/.test(name)) return 'Choose a name, not a path.';
            if (/^\.+$/.test(name)) return 'Choose a name other than dots.';
            if (Array.from(name).some(character => character.charCodeAt(0) < 0x20)) return 'The name contains an unsupported control character.';
            return '';
        };
        const refreshValidation = (showInvalid = false) => {
            const value = input.value.trim();
            const message = validationMessage(value);
            confirmButton.disabled = Boolean(message) || value === oldName;
            if (showInvalid && message) {
                error.textContent = message;
                error.hidden = false;
                input.setAttribute('aria-invalid', 'true');
            } else {
                error.hidden = true;
                input.removeAttribute('aria-invalid');
            }
            return !message;
        };
        const settle = (value, restoreFocus = true) => {
            if (!lifecycle.close(restoreFocus)) return;
            resolve(value);
        };
        const submit = () => {
            if (!refreshValidation(true)) {
                input.focus();
                return;
            }
            const value = input.value.trim();
            if (value !== oldName) settle(value);
        };
        lifecycle = activateModal(overlay, {
            initialFocus: input,
            dismissOnBackdrop: false,
            onDismiss: () => resolve(null),
            onKeydown: event => {
                if (event.key === 'Enter' && document.activeElement === input) {
                    event.preventDefault();
                    submit();
                }
            },
        });
        input.addEventListener('input', () => refreshValidation(false));
        form.addEventListener('submit', event => {
            event.preventDefault();
            submit();
        });
        cancelButton.addEventListener('click', () => settle(null));
        setTimeout(() => {
            input.focus();
            const dot = type === 'file' ? oldName.lastIndexOf('.') : -1;
            input.setSelectionRange(0, dot > 0 ? dot : oldName.length);
        }, 0);
    });
}

/** A focused file-creation dialog with destination and inline validation. */
export function newNoteDialog(parentDirectory = '') {
    return new Promise(resolve => {
        const location = parentDirectory ? parentDirectory + '/' : 'Vault root';
        const id = `new-file-${dialogSequence + 1}`;
        const { overlay } = createDialogShell({
            title: 'New file',
            description: 'Create a Markdown note by default, or enter another file extension.',
            tone: 'neutral',
            icon: 'file-add',
            className: 'new-note-modal',
            content: `
                <form id="${id}-form" class="custom-modal-form">
                    <div class="custom-modal-context new-note-location"><span>Location</span><code title="${escapeHtml(location)}">${escapeHtml(location)}</code></div>
                    <label class="custom-modal-field new-note-field" for="new-note-name">Name</label>
                    <span class="new-note-input-wrap"><input id="new-note-name" class="custom-modal-input" type="text" value="Untitled.md" autocomplete="off" spellcheck="false" aria-describedby="${id}-help ${id}-error"></span>
                    <p class="custom-modal-help new-note-help" id="${id}-help">Use a file name, not a path. Names without an extension use .md.</p>
                    <p class="custom-modal-error new-note-error" id="${id}-error" role="alert" hidden></p>
                </form>
            `,
            footer: `
                <button type="button" class="custom-modal-btn custom-modal-btn-cancel">Cancel</button>
                <button type="submit" form="${id}-form" class="custom-modal-btn custom-modal-btn-confirm">Create file</button>
            `,
        });
        const form = overlay.querySelector('form');
        const input = overlay.querySelector('#new-note-name');
        const error = overlay.querySelector('.new-note-error');
        const cancelButton = overlay.querySelector('.custom-modal-btn-cancel');
        let lifecycle = null;
        const showError = message => {
            error.textContent = message;
            error.hidden = false;
            input.setAttribute('aria-invalid', 'true');
            input.focus();
        };
        const settle = (value, restoreFocus = true) => {
            if (!lifecycle.close(restoreFocus)) return;
            resolve(value);
        };
        const submit = () => {
            const filename = normaliseNewNoteFilename(input.value);
            if (!filename) return showError('Enter a name for the new file.');
            if (/[\\/]/.test(filename)) return showError('Choose a name, not a path.');
            if (/^\.+$/.test(filename)) return showError('Choose a name other than dots.');
            settle(filename);
        };
        lifecycle = activateModal(overlay, {
            initialFocus: input,
            dismissOnBackdrop: false,
            onDismiss: () => resolve(null),
            onKeydown: event => {
                if (event.key === 'Enter' && document.activeElement === input) {
                    event.preventDefault();
                    submit();
                }
            },
        });
        input.addEventListener('input', () => {
            error.hidden = true;
            input.removeAttribute('aria-invalid');
        });
        form.addEventListener('submit', event => {
            event.preventDefault();
            submit();
        });
        cancelButton.addEventListener('click', () => settle(null));
        setTimeout(() => input.select(), 0);
    });
}

/** Select the source notes that will be merged and deleted. */
export function mergeNotesDialog(destinationPath, sourcePaths) {
    return new Promise(resolve => {
        const destinationName = String(destinationPath || '').replaceAll('\\', '/').split('/').pop();
        const sources = Array.isArray(sourcePaths) ? sourcePaths : [];
        const sourceRows = sources.map((path, index) => {
            const normalized = String(path || '').replaceAll('\\', '/');
            const name = normalized.split('/').pop();
            return `<label class="merge-file-row" title="${escapeHtml(normalized)}">
                <input type="checkbox" class="merge-checkbox" data-index="${index}" checked>
                <span class="merge-file-icon" aria-hidden="true">${iconSVG('file')}</span>
                <span class="merge-file-name">${escapeHtml(name)}</span>
            </label>`;
        }).join('');
        const { overlay } = createDialogShell({
            title: 'Merge notes',
            description: 'Append selected source notes to the destination in the order shown.',
            tone: 'warning',
            icon: 'merge',
            className: 'merge-notes-modal',
            content: `
                <div class="merge-dest-row" title="${escapeHtml(destinationPath)}">
                    <span class="merge-dest-icon" aria-hidden="true">${iconSVG('file')}</span>
                    <span class="merge-dest-label">Destination</span>
                    <span class="merge-dest-name">${escapeHtml(destinationName)}</span>
                </div>
                <fieldset class="merge-sources"><legend>Sources to append</legend>${sourceRows}</fieldset>
                <div class="custom-modal-notice custom-modal-notice--warning merge-warning">${iconSVG('warning')}<span>Selected source notes will be permanently deleted after their content is appended.</span></div>
            `,
            footer: `
                <button type="button" class="custom-modal-btn custom-modal-btn-cancel">Cancel</button>
                <button type="button" class="custom-modal-btn custom-modal-btn-delete">Merge and delete sources</button>
            `,
        });
        const checkboxes = [...overlay.querySelectorAll('.merge-checkbox')];
        const cancelButton = overlay.querySelector('.custom-modal-btn-cancel');
        const confirmButton = overlay.querySelector('.custom-modal-btn-delete');
        let lifecycle = null;
        const selected = () => checkboxes.filter(checkbox => checkbox.checked).map(checkbox => Number(checkbox.dataset.index));
        const update = () => { confirmButton.disabled = selected().length === 0; };
        const settle = (value, restoreFocus = true) => {
            if (!lifecycle.close(restoreFocus)) return;
            resolve(value);
        };
        lifecycle = activateModal(overlay, {
            initialFocus: cancelButton,
            dismissOnBackdrop: false,
            onDismiss: () => resolve(null),
        });
        checkboxes.forEach(checkbox => checkbox.addEventListener('change', update));
        cancelButton.addEventListener('click', () => settle(null));
        confirmButton.addEventListener('click', () => settle(selected()));
        update();
    });
}

/** Present recoverable PDF-export failures in the shared dialog language. */
export function pdfExportErrorDialog(error, options = {}) {
    return new Promise(resolve => {
        const message = String(error?.message || error || 'Could not export the PDF.').trim();
        const exportedPath = typeof options.exportedPath === 'string' ? options.exportedPath : '';
        const viewerFailure = Boolean(exportedPath);
        const noBrowser = !viewerFailure && /no browser engine (?:was|could be) found/i.test(message);
        const detail = message.length > 360 ? `${message.slice(0, 357)}…` : message;
        const title = viewerFailure ? 'PDF exported, but not opened' : noBrowser ? 'A browser is needed for PDF export' : 'PDF export couldn’t finish';
        const description = viewerFailure
            ? 'The PDF was created safely, but Figaro could not start the application registered to open PDF files.'
            : noBrowser
                ? 'Figaro uses a local browser engine so links, contents, and footnotes stay clickable in the PDF.'
                : 'The document was not changed. Correct the issue and try again.';
        const content = viewerFailure
            ? `<div class="custom-modal-notice pdf-export-error-detail"><span>Saved at</span><code>${escapeHtml(exportedPath)}</code><small>Open it from the file tree or your file manager.</small></div>`
            : noBrowser
                ? '<div class="custom-modal-notice custom-modal-notice--warning pdf-export-error-guidance"><strong>What to do</strong><span class="pdf-browser-recovery-message">Install or expose Chrome, Chromium, Ungoogled Chromium, or Edge, or choose the installed executable here or in Settings.</span></div>'
                : `<div class="custom-modal-notice custom-modal-notice--danger pdf-export-error-detail"><code>${escapeHtml(detail)}</code></div>`;
        const footer = noBrowser
            ? '<button type="button" class="custom-modal-btn custom-modal-btn-cancel">Not now</button><button type="button" class="custom-modal-btn custom-modal-btn-confirm pdf-browser-choose-btn">Choose browser…</button>'
            : '<button type="button" class="custom-modal-btn custom-modal-btn-confirm">Got it</button>';
        const { overlay } = createDialogShell({
            title,
            description,
            tone: noBrowser || viewerFailure ? 'warning' : 'danger',
            icon: noBrowser || viewerFailure ? 'warning' : 'error',
            className: 'pdf-export-error-modal',
            content,
            footer,
        });
        const closeButton = overlay.querySelector('.custom-modal-btn-cancel, .custom-modal-btn-confirm:not(.pdf-browser-choose-btn)');
        const chooseButton = overlay.querySelector('.pdf-browser-choose-btn');
        let lifecycle = null;
        const settle = (restoreFocus = true) => {
            if (!lifecycle.close(restoreFocus)) return;
            resolve();
        };
        lifecycle = activateModal(overlay, {
            initialFocus: chooseButton || closeButton,
            onDismiss: resolve,
        });
        closeButton?.addEventListener('click', () => settle());
        chooseButton?.addEventListener('click', async () => {
            const recovery = overlay.querySelector('.pdf-browser-recovery-message');
            chooseButton.disabled = true;
            chooseButton.textContent = 'Checking…';
            try {
                const result = await window.pywebview.api.pdf_browser_choose();
                if (result?.success) return settle();
                if (!result?.cancelled && recovery) {
                    recovery.textContent = result?.error || 'The selected executable cannot create PDFs.';
                    recovery.closest('.custom-modal-notice')?.classList.add('custom-modal-notice--danger');
                }
            } catch (chooseError) {
                if (recovery) recovery.textContent = chooseError?.message || 'Could not open the browser chooser.';
            } finally {
                if (chooseButton.isConnected) {
                    chooseButton.disabled = false;
                    chooseButton.textContent = 'Choose browser…';
                }
            }
        });
    });
}

function normaliseNewNoteFilename(value) {
    const filename = String(value || '').trim();
    if (!filename || Array.from(filename).some(character => character.charCodeAt(0) < 0x20)) return '';
    return filename.includes('.') ? filename : filename + '.md';
}

function closeActiveModal(restoreFocus = true) {
    if (activeModalDismiss) {
        activeModalDismiss(restoreFocus);
        return;
    }
    if (activeModal) {
        activeModal.remove();
        activeModal = null;
        document.body.classList.remove('custom-modal-open');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

export default {
    confirmDialog,
    errorDialog,
    messageDialog,
    mergeNotesDialog,
    newNoteDialog,
    pdfExportErrorDialog,
    promptDialog,
    renamePathDialog,
    tableConversionDialog,
};
