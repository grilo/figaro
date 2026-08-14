export function renderVaultLoading(presentation, root = document) {
    const panel = root.getElementById?.('vault-loading-panel');
    if (!panel) return false;

    const title = root.getElementById('vault-loading-title');
    const message = root.getElementById('vault-loading-message');
    const count = root.getElementById('vault-loading-count');
    const card = root.getElementById('vault-loading-card');
    const progress = root.getElementById('vault-loading-progress');
    const value = root.getElementById('vault-loading-progress-value');

    if (title) title.textContent = presentation.title;
    if (message) message.textContent = presentation.message;
    if (count) count.textContent = presentation.count;
    panel.setAttribute('aria-busy', String(presentation.busy));
    panel.dataset.phase = presentation.phase;
    card?.classList.toggle('ui-notice--info', presentation.phase !== 'error');
    card?.classList.toggle('ui-notice--danger', presentation.phase === 'error');

    if (progress) {
        progress.setAttribute('aria-valuetext', presentation.ariaText);
        if (presentation.percent == null) {
            progress.removeAttribute('aria-valuenow');
        } else {
            progress.setAttribute('aria-valuenow', String(presentation.percent));
        }
    }
    value?.style.setProperty('--ui-progress', `${presentation.percent || 0}%`);
    return true;
}

export function removeVaultLoading(root = document) {
    const panel = root.getElementById?.('vault-loading-panel');
    if (!panel) return false;
    panel.remove();
    return true;
}

export default { renderVaultLoading, removeVaultLoading };
