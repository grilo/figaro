import { describeUpdateStatus, updateActionLabel } from '../../../frontend/js/core/updateModel.js';
import {
    initUpdateNotifications,
    initUpdateSettings,
    resetUpdateNotificationsForTest,
} from '../../../frontend/js/updateSettings.js';

function settingsMarkup() {
    const root = document.createElement('div');
    root.innerHTML = `
        <input type="checkbox" id="update-checks-toggle">
        <p id="update-status"></p>
        <button type="button" id="update-check">Check now</button>
        <button type="button" id="update-action" hidden></button>`;
    document.body.appendChild(root);
    return root;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('update status model', () => {
    test('offers the next step for each native updater state', () => {
        expect(describeUpdateStatus({ state: 'available', version: '1.47.0', currentVersion: '1.46.0' }))
            .toMatchObject({ kind: 'available', action: 'install' });
        expect(describeUpdateStatus({ state: 'ready' })).toMatchObject({ kind: 'ready', action: 'restart' });
        expect(describeUpdateStatus({ state: 'up-to-date', currentVersion: '1.46.0' }))
            .toEqual({ kind: 'current', message: 'Figaro 1.46.0 is the latest release.', action: null });
        expect(describeUpdateStatus({ state: 'unsupported' })).toMatchObject({ kind: 'unsupported', action: null });
        expect(describeUpdateStatus({ state: 'error', error: 'rate limited' }))
            .toEqual({ kind: 'error', message: 'rate limited', action: null });
        expect(updateActionLabel('install')).toBe('Download and install');
        expect(updateActionLabel('restart')).toBe('Restart to update');
        expect(updateActionLabel(null)).toBe('');
    });
});

describe('Updates settings card', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    test('persists the opt-in and reverts the toggle when saving fails', async () => {
        const root = settingsMarkup();
        const native = {
            UpdateSettingsLoad: jest.fn().mockResolvedValue({ success: true, enabled: false, supported: true }),
            UpdateSettingsSave: jest.fn()
                .mockResolvedValueOnce({ success: true, enabled: true })
                .mockResolvedValueOnce({ success: false, error: 'disk full' }),
        };
        await initUpdateSettings(root, { backend: () => native });
        const toggle = root.querySelector('#update-checks-toggle');
        expect(toggle.checked).toBe(false);

        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        await flush();
        expect(native.UpdateSettingsSave).toHaveBeenLastCalledWith(true);
        expect(toggle.checked).toBe(true);

        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
        await flush();
        expect(toggle.checked).toBe(true);
        expect(root.querySelector('#update-status').textContent).toBe('disk full');
    });

    test('checks, installs, then offers a restart only after verification', async () => {
        const root = settingsMarkup();
        const native = {
            UpdateSettingsLoad: jest.fn().mockResolvedValue({ success: true, enabled: true, supported: true }),
            UpdateCheck: jest.fn().mockResolvedValue({ state: 'available', version: '1.47.0', currentVersion: '1.46.0' }),
            UpdateInstall: jest.fn().mockResolvedValue({ state: 'ready' }),
            UpdateRestart: jest.fn().mockResolvedValue({ state: 'ready' }),
        };
        await initUpdateSettings(root, { backend: () => native });
        const action = root.querySelector('#update-action');
        expect(action.hidden).toBe(true);

        root.querySelector('#update-check').click();
        await flush();
        expect(action.hidden).toBe(false);
        expect(action.textContent).toBe('Download and install');
        expect(native.UpdateInstall).not.toHaveBeenCalled();

        action.click();
        await flush();
        expect(native.UpdateInstall).toHaveBeenCalledTimes(1);
        expect(native.UpdateRestart).not.toHaveBeenCalled();
        expect(action.textContent).toBe('Restart to update');

        action.click();
        await flush();
        expect(native.UpdateRestart).toHaveBeenCalledTimes(1);
    });

    test('disables checks on builds that cannot update themselves', async () => {
        const root = settingsMarkup();
        const native = {
            UpdateSettingsLoad: jest.fn().mockResolvedValue({ success: true, enabled: false, supported: false, currentVersion: '1.46.0' }),
        };
        await initUpdateSettings(root, { backend: () => native });
        expect(root.querySelector('#update-checks-toggle').disabled).toBe(true);
        expect(root.querySelector('#update-check').disabled).toBe(true);
        expect(root.querySelector('#update-status').dataset.kind).toBe('unsupported');
    });
});

describe('startup update notice', () => {
    beforeEach(() => resetUpdateNotificationsForTest());

    test('downloads only after consent and restarts only after a second consent', async () => {
        const native = {
            UpdateStartupCheck: jest.fn().mockResolvedValue({ state: 'available', version: '1.47.0', currentVersion: '1.46.0' }),
            UpdateInstall: jest.fn().mockResolvedValue({ state: 'ready' }),
            UpdateRestart: jest.fn().mockResolvedValue({ state: 'ready' }),
        };
        const confirm = jest.fn().mockResolvedValueOnce('confirm').mockResolvedValueOnce(false);

        await initUpdateNotifications({ backend: () => native, confirm });
        expect(confirm.mock.calls[0][0]).toBe('Figaro 1.47.0 is available');
        expect(native.UpdateInstall).toHaveBeenCalledTimes(1);
        expect(native.UpdateRestart).not.toHaveBeenCalled();
    });

    test('leaves the release alone when the user declines', async () => {
        const native = {
            UpdateStartupCheck: jest.fn().mockResolvedValue({ state: 'available', version: '1.47.0' }),
            UpdateInstall: jest.fn(),
            UpdateRestart: jest.fn(),
        };
        await initUpdateNotifications({ backend: () => native, confirm: jest.fn().mockResolvedValue(false) });
        expect(native.UpdateInstall).not.toHaveBeenCalled();
    });

    test('asks once per launch and stays quiet without an available release', async () => {
        const confirm = jest.fn();
        const native = { UpdateStartupCheck: jest.fn().mockResolvedValue(null) };
        await expect(initUpdateNotifications({ backend: () => native, confirm })).resolves.toBe(false);
        await initUpdateNotifications({ backend: () => native, confirm });
        expect(native.UpdateStartupCheck).toHaveBeenCalledTimes(1);

        resetUpdateNotificationsForTest();
        native.UpdateStartupCheck.mockRejectedValue(new Error('offline'));
        await expect(initUpdateNotifications({ backend: () => native, confirm })).resolves.toBe(false);
        expect(confirm).not.toHaveBeenCalled();
    });
});
