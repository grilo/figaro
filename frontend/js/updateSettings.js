/**
 * Settings and startup notice for in-app updates.
 *
 * The native backend owns GitHub access, verification and the binary swap;
 * this module only reflects its states and asks before downloading or
 * restarting.
 */

import { backend as defaultBackend } from './backend.js';
import { confirmDialog as defaultConfirm } from './dialogs.js';
import { describeUpdateStatus, updateActionLabel } from './core/updateModel.js';

let notificationsInitialized = false;

function findIn(root, selector) {
    return root && root.querySelector ? root.querySelector(selector) : null;
}

function isActive(root) {
    return root === document || (!!root && root.isConnected && !root._settingsPanelDisposed);
}

/** Bind the Updates settings card to the native updater. */
export async function initUpdateSettings(root = document, { backend = defaultBackend } = {}) {
    const toggle = findIn(root, '#update-checks-toggle');
    const status = findIn(root, '#update-status');
    const check = findIn(root, '#update-check');
    const action = findIn(root, '#update-action');
    if (!toggle || !status || !check || !action) return false;

    let pendingAction = null;
    const render = (update) => {
        const description = describeUpdateStatus(update);
        status.dataset.kind = description.kind;
        status.textContent = description.message;
        pendingAction = description.action;
        action.hidden = !pendingAction;
        action.textContent = updateActionLabel(pendingAction);
    };
    const busy = (message) => {
        status.dataset.kind = 'checking';
        status.textContent = message;
        check.disabled = true;
        action.disabled = true;
    };
    const idle = () => {
        check.disabled = false;
        action.disabled = false;
    };

    try {
        const settings = await backend().UpdateSettingsLoad();
        if (!isActive(root)) return true;
        toggle.checked = Boolean(settings?.enabled);
        if (settings?.supported === false) {
            render({ state: 'unsupported', currentVersion: settings.currentVersion });
            toggle.disabled = true;
            check.disabled = true;
        } else {
            render(settings?.success === false ? { state: 'error', error: settings.error } : {});
        }
    } catch (error) {
        if (isActive(root)) render({ state: 'error', error: error?.message || 'Could not load update settings.' });
    }

    toggle.addEventListener('change', async () => {
        const enabled = toggle.checked;
        toggle.disabled = true;
        try {
            const result = await backend().UpdateSettingsSave(enabled);
            if (!isActive(root)) return;
            if (result?.success === false) {
                toggle.checked = !enabled;
                render({ state: 'error', error: result.error || 'Could not save the update preference.' });
            }
        } catch (error) {
            if (!isActive(root)) return;
            toggle.checked = !enabled;
            render({ state: 'error', error: error?.message || 'Could not save the update preference.' });
        } finally {
            if (isActive(root)) toggle.disabled = false;
        }
    });

    check.addEventListener('click', async () => {
        busy('Checking GitHub Releases…');
        try {
            const result = await backend().UpdateCheck();
            if (isActive(root)) render(result);
        } catch (error) {
            if (isActive(root)) render({ state: 'error', error: error?.message || 'Could not check for updates.' });
        } finally {
            if (isActive(root)) idle();
        }
    });

    action.addEventListener('click', async () => {
        const next = pendingAction;
        if (!next) return;
        busy(next === 'install' ? 'Downloading and verifying the update…' : 'Restarting Figaro…');
        try {
            const result = next === 'install' ? await backend().UpdateInstall() : await backend().UpdateRestart();
            if (isActive(root)) render(result);
        } catch (error) {
            if (isActive(root)) render({ state: 'error', error: error?.message || 'The update could not be completed.' });
        } finally {
            if (isActive(root)) idle();
        }
    });
    return true;
}

/**
 * Offer an update found by the opted-in startup check. The check runs once
 * Figaro is ready, so its answer always has a prompt waiting for it.
 * Declining leaves the release available from Settings.
 */
export async function initUpdateNotifications({
    backend = defaultBackend,
    confirm = defaultConfirm,
} = {}) {
    if (notificationsInitialized) return false;
    notificationsInitialized = true;
    let status;
    try {
        status = await backend().UpdateStartupCheck();
    } catch (_) {
        // The backend logs failed checks; a missing answer must not interrupt writing.
        return false;
    }
    if (status?.state !== 'available') return false;
    const install = await confirm(
        `Figaro ${status.version || ''} is available`.trim(),
        `You are running ${status.currentVersion || 'an older version'}. Figaro downloads the update, verifies it, and asks before restarting.`,
        false,
        false,
        { confirmLabel: 'Download and install', cancelLabel: 'Not now', icon: 'info' },
    );
    if (install !== 'confirm') return true;
    const staged = await backend().UpdateInstall();
    const description = describeUpdateStatus(staged);
    const restart = await confirm(
        description.kind === 'ready' ? 'Update ready' : 'Update failed',
        description.message,
        false,
        false,
        description.action === 'restart'
            ? { confirmLabel: 'Restart now', cancelLabel: 'Later', icon: 'info' }
            : { confirmLabel: 'OK', cancelLabel: 'Close', tone: 'warning' },
    );
    if (restart === 'confirm' && description.action === 'restart') {
        await backend().UpdateRestart();
    }
    return true;
}

export function resetUpdateNotificationsForTest() {
    notificationsInitialized = false;
}
