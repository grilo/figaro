export function initStartupLogsSettings(container, openFolder) {
    const button = container.querySelector('#open-startup-logs');
    const status = container.querySelector('#startup-logs-status');
    let pending = false;
    button.addEventListener('click', async () => {
        if (pending) return;
        pending = true;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Opening…';
        status.hidden = true;
        try {
            const result = await openFolder();
            if (!result?.success) throw new Error(result?.error || 'Could not open the startup log folder.');
            status.className = 'ui-notice ui-notice--success';
            status.textContent = 'Opened the startup log folder.';
        } catch (error) {
            status.className = 'ui-notice ui-notice--danger';
            status.textContent = error?.message || String(error) || 'Could not open the startup log folder.';
        } finally {
            pending = false;
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = 'Open startup logs';
            status.hidden = false;
        }
    });
}
