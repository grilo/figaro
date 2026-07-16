/**
 * Dialogs Module - Confirm and Prompt modal dialogs
 */

let activeModal = null;
let activeModalDismiss = null;

/**
 * Show confirm dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {boolean} isDanger - Use red confirm button
 * @param {boolean} html - If true, message is raw HTML (not escaped)
 * @returns {Promise<boolean>} True if confirmed
 */
export function confirmDialog(title, message, isDanger = false, html = false, options = {}) {
    return new Promise((resolve) => {
        closeActiveModal();
        
        const confirmLabel = options.confirmLabel || (isDanger ? 'Delete' : 'Confirm');
        const cancelLabel = options.cancelLabel || 'Cancel';
        const extraLabel = options.extraLabel || null;

        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        overlay.innerHTML = `
            <div class="custom-modal">
                <h3>${escapeHtml(title)}</h3>
                <div class="custom-modal-body">${html ? message : escapeHtml(message)}</div>
                <div class="custom-modal-buttons">
                    <button class="custom-modal-btn custom-modal-btn-cancel">${escapeHtml(cancelLabel)}</button>
                    ${extraLabel ? `<button class="custom-modal-btn custom-modal-btn-extra">${escapeHtml(extraLabel)}</button>` : ''}
                    <button class="custom-modal-btn ${isDanger ? 'custom-modal-btn-delete' : 'custom-modal-btn-confirm'}">
                        ${escapeHtml(confirmLabel)}
                    </button>
                </div>
            </div>
        `;
        
        const cancelBtn = overlay.querySelector('.custom-modal-btn-cancel');
        const confirmBtn = overlay.querySelector('.custom-modal-btn-confirm, .custom-modal-btn-delete');
        const extraBtn = overlay.querySelector('.custom-modal-btn-extra');
        
        const cleanup = () => {
            overlay.remove();
            if (activeModal === overlay) activeModal = null;
            if (activeModalDismiss === dismiss) activeModalDismiss = null;
            document.removeEventListener('keydown', handleKeydown);
        };
        const dismiss = () => {
            cleanup();
            resolve(false);
        };
        
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                resolve(false);
            }
        };
        
        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(false);
        });
        
        confirmBtn.addEventListener('click', () => {
            cleanup();
            resolve('confirm');
        });

        if (extraBtn) {
            extraBtn.addEventListener('click', () => {
                cleanup();
                resolve('extra');
            });
        }
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(false);
            }
        });
        
        document.body.appendChild(overlay);
        activeModal = overlay;
        activeModalDismiss = dismiss;
        document.addEventListener('keydown', handleKeydown);
        
        setTimeout(() => confirmBtn.focus(), 0);
    });
}

/**
 * Show an informational dialog with one acknowledgement button.
 * @param {string} title - Dialog title
 * @param {string} message - Plain-text dialog message
 * @returns {Promise<void>} Resolves when dismissed
 */
export function messageDialog(title, message) {
    return new Promise((resolve) => {
        closeActiveModal();

        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        overlay.innerHTML = `
            <div class="custom-modal">
                <h3>${escapeHtml(title)}</h3>
                <div class="custom-modal-body">${escapeHtml(message)}</div>
                <div class="custom-modal-buttons">
                    <button class="custom-modal-btn custom-modal-btn-confirm">OK</button>
                </div>
            </div>
        `;

        const confirmBtn = overlay.querySelector('.custom-modal-btn-confirm');
        const cleanup = () => {
            overlay.remove();
            if (activeModal === overlay) activeModal = null;
            if (activeModalDismiss === dismiss) activeModalDismiss = null;
            document.removeEventListener('keydown', handleKeydown);
        };
        const dismiss = () => {
            cleanup();
            resolve();
        };
        const handleKeydown = (event) => {
            if (event.key === 'Escape' || event.key === 'Enter') dismiss();
        };

        confirmBtn.addEventListener('click', dismiss);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) dismiss();
        });

        document.body.appendChild(overlay);
        activeModal = overlay;
        activeModalDismiss = dismiss;
        document.addEventListener('keydown', handleKeydown);
        setTimeout(() => confirmBtn.focus(), 0);
    });
}

/**
 * Show prompt dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {string} defaultValue - Default input value
 * @returns {Promise<string|null>} Input value or null if cancelled
 */
export function promptDialog(title, message, defaultValue = '') {
    return new Promise((resolve) => {
        closeActiveModal();
        
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        overlay.innerHTML = `
            <div class="custom-modal">
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(message)}</p>
                <input type="text" class="custom-modal-input" value="${escapeHtml(defaultValue)}">
                <div class="custom-modal-buttons">
                    <button class="custom-modal-btn custom-modal-btn-cancel">Cancel</button>
                    <button class="custom-modal-btn custom-modal-btn-confirm">OK</button>
                </div>
            </div>
        `;
        
        const input = overlay.querySelector('.custom-modal-input');
        const cancelBtn = overlay.querySelector('.custom-modal-btn-cancel');
        const confirmBtn = overlay.querySelector('.custom-modal-btn-confirm');
        
        const cleanup = () => {
            overlay.remove();
            if (activeModal === overlay) activeModal = null;
            if (activeModalDismiss === dismiss) activeModalDismiss = null;
            document.removeEventListener('keydown', handleKeydown);
        };
        const dismiss = () => {
            cleanup();
            resolve(null);
        };
        
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                resolve(null);
            } else if (e.key === 'Enter' && document.activeElement === input) {
                cleanup();
                resolve(input.value);
            }
        };
        
        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(null);
        });
        
        confirmBtn.addEventListener('click', () => {
            cleanup();
            resolve(input.value);
        });
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(null);
            }
        });
        
        document.body.appendChild(overlay);
        activeModal = overlay;
        activeModalDismiss = dismiss;
        document.addEventListener('keydown', handleKeydown);
        
        // Focus and select input
        setTimeout(() => {
            input.focus();
            input.select();
        }, 0);
    });
}

/**
 * A focused file-creation dialog. Names without an extension become Markdown
 * notes, while an explicit extension is preserved for CSS, JavaScript, and
 * other source files.
 *
 * @param {string} parentDirectory Vault-relative destination directory
 * @returns {Promise<string|null>} Canonical vault filename or null
 */
export function newNoteDialog(parentDirectory = '') {
    return new Promise((resolve) => {
        closeActiveModal();

        const location = parentDirectory ? parentDirectory + '/' : 'Vault root';
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        overlay.innerHTML = `
            <form class="custom-modal new-note-modal" aria-labelledby="new-note-title">
                <div class="new-note-heading">
                    <span class="new-note-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 12v6M9 15h6"/></svg>
                    </span>
                    <div>
                        <h3 id="new-note-title">New file</h3>
                        <p>Create a Markdown note by default, or enter another file extension.</p>
                    </div>
                </div>
                <div class="new-note-location">
                    <span>Location</span>
                    <code title="${escapeHtml(location)}">${escapeHtml(location)}</code>
                </div>
                <label class="new-note-field" for="new-note-name">
                    <span>Name</span>
                    <span class="new-note-input-wrap">
                        <input id="new-note-name" class="custom-modal-input" type="text" value="Untitled.md" autocomplete="off" spellcheck="false" aria-describedby="new-note-help new-note-error">
                    </span>
                </label>
                <p class="new-note-help" id="new-note-help">Use a file name, not a path. Names without an extension use .md.</p>
                <p class="new-note-error" id="new-note-error" role="alert" hidden></p>
                <div class="custom-modal-buttons">
                    <button type="button" class="custom-modal-btn custom-modal-btn-cancel">Cancel</button>
                    <button type="submit" class="custom-modal-btn custom-modal-btn-confirm">Create file</button>
                </div>
            </form>
        `;

        const form = overlay.querySelector('form');
        const input = overlay.querySelector('#new-note-name');
        const error = overlay.querySelector('#new-note-error');
        const cancelButton = overlay.querySelector('.custom-modal-btn-cancel');

        const cleanup = () => {
            overlay.remove();
            if (activeModal === overlay) activeModal = null;
            if (activeModalDismiss === dismiss) activeModalDismiss = null;
            document.removeEventListener('keydown', handleKeydown);
        };
        const dismiss = () => {
            cleanup();
            resolve(null);
        };
        const showError = (message) => {
            error.textContent = message;
            error.hidden = false;
            input.setAttribute('aria-invalid', 'true');
            input.focus();
        };
        const submit = () => {
            const filename = normaliseNewNoteFilename(input.value);
            if (!filename) {
                showError('Enter a name for the new file.');
                return;
            }
            if (/[\\/]/.test(filename)) {
                showError('Choose a name, not a path.');
                return;
            }
            if (/^\.+$/.test(filename)) {
                showError('Choose a name other than dots.');
                return;
            }
            cleanup();
            resolve(filename);
        };
        const handleKeydown = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            cleanup();
            resolve(null);
        };

        input.addEventListener('input', () => {
            error.hidden = true;
            input.removeAttribute('aria-invalid');
        });
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            submit();
        });
        cancelButton.addEventListener('click', () => {
            cleanup();
            resolve(null);
        });
        overlay.addEventListener('click', (event) => {
            if (event.target !== overlay) return;
            cleanup();
            resolve(null);
        });

        document.body.appendChild(overlay);
        activeModal = overlay;
        activeModalDismiss = dismiss;
        document.addEventListener('keydown', handleKeydown);
        setTimeout(() => {
            input.focus();
            input.select();
        }, 0);
    });
}

/**
 * Present PDF-export failures in the application visual language instead of a
 * browser alert. Missing browser engines get recovery guidance; other export
 * failures retain a concise, safely escaped diagnostic.
 *
 * @param {unknown} error
 * @returns {Promise<void>}
 */
export function pdfExportErrorDialog(error, options = {}) {
    return new Promise((resolve) => {
        closeActiveModal();

        const message = String(error?.message || error || 'Could not export the PDF.').trim();
        const exportedPath = typeof options.exportedPath === 'string' ? options.exportedPath : '';
        const viewerFailure = Boolean(exportedPath);
        const noBrowser = !viewerFailure && /no browser engine (?:was|could be) found/i.test(message);
        const detail = message.length > 360 ? `${message.slice(0, 357)}…` : message;
        let description = 'The document was not changed. You can correct the issue and try again.';
        if (viewerFailure) {
            description = 'The PDF was created safely, but Figaro could not start the application registered to open PDF files.';
        } else if (noBrowser) {
            description = 'Figaro uses a local browser engine so links, contents, and footnotes stay clickable in the PDF.';
        }
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        overlay.innerHTML = `
            <section class="custom-modal pdf-export-error-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-export-error-title">
                <div class="pdf-export-error-heading">
                    <span class="pdf-export-error-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="m10.3 3.86-8.04 13.5A2 2 0 0 0 3.98 20h16.04a2 2 0 0 0 1.72-3.03l-8.04-13.1a2 2 0 0 0-3.4-.01Z"/></svg>
                    </span>
                    <div>
                        <h3 id="pdf-export-error-title">${viewerFailure ? 'PDF exported, but not opened' : noBrowser ? 'A browser is needed for PDF export' : 'PDF export couldn’t finish'}</h3>
                        <p>${description}</p>
                    </div>
                </div>
                ${viewerFailure ? `
                    <p class="pdf-export-error-detail">Saved at ${escapeHtml(exportedPath)}. Open it from the file tree or your file manager.</p>` : noBrowser ? `
                    <div class="pdf-export-error-guidance">
                        <strong>What to do</strong>
                        <span class="pdf-browser-recovery-message">Install or expose Chrome, Chromium, Ungoogled Chromium, or Edge, or choose the installed executable here or in Settings.</span>
                    </div>` : `
                    <p class="pdf-export-error-detail">${escapeHtml(detail)}</p>`}
                <div class="custom-modal-buttons">
                    ${noBrowser ? '<button type="button" class="custom-modal-btn custom-modal-btn-cancel pdf-browser-choose-btn">Choose browser…</button>' : ''}
                    <button type="button" class="custom-modal-btn custom-modal-btn-confirm">Got it</button>
                </div>
            </section>
        `;

        const closeButton = overlay.querySelector('.custom-modal-btn-confirm');
        const chooseButton = overlay.querySelector('.pdf-browser-choose-btn');
        const cleanup = () => {
            overlay.remove();
            if (activeModal === overlay) activeModal = null;
            if (activeModalDismiss === dismiss) activeModalDismiss = null;
            document.removeEventListener('keydown', handleKeydown);
        };
        const dismiss = () => {
            cleanup();
            resolve();
        };
        const handleKeydown = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            dismiss();
        };

        closeButton.addEventListener('click', dismiss);
        chooseButton?.addEventListener('click', async () => {
            const recovery = overlay.querySelector('.pdf-browser-recovery-message');
            chooseButton.disabled = true;
            chooseButton.textContent = 'Checking…';
            try {
                const result = await window.pywebview.api.pdf_browser_choose();
                if (result?.success) {
                    cleanup();
                    resolve();
                    return;
                }
                if (!result?.cancelled && recovery) {
                    recovery.textContent = result?.error || 'The selected executable cannot create PDFs.';
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
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) dismiss();
        });
        document.body.appendChild(overlay);
        activeModal = overlay;
        activeModalDismiss = dismiss;
        document.addEventListener('keydown', handleKeydown);
        setTimeout(() => closeButton.focus(), 0);
    });
}

function normaliseNewNoteFilename(value) {
    const filename = String(value || '').trim();
    if (!filename || Array.from(filename).some(character => character.charCodeAt(0) < 0x20)) return '';
    return filename.includes('.') ? filename : filename + '.md';
}

/**
 * Close any active modal
 */
function closeActiveModal() {
    if (activeModalDismiss) {
        activeModalDismiss();
        return;
    }
    if (activeModal) {
        activeModal.remove();
        activeModal = null;
    }
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export default {
    confirmDialog,
    promptDialog,
    newNoteDialog,
    pdfExportErrorDialog
};
