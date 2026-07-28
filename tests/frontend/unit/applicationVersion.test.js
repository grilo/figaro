import { applicationVersionPresentation } from '../frontend/js/core/applicationVersionModel.js';
import { loadApplicationVersion } from '../frontend/js/usecases/loadApplicationVersion.js';

describe('Settings application version', () => {
    test('normalizes packaged metadata into a ready presentation', () => {
        expect(applicationVersionPresentation(' 1.7.0 ')).toEqual({
            text: '1.7.0',
            state: 'ready',
        });
    });

    test('shows an unavailable state when the backend cannot provide metadata', async () => {
        const present = jest.fn();
        const result = await loadApplicationVersion({
            readVersion: jest.fn().mockRejectedValue(new Error('metadata unavailable')),
            present,
        });

        expect(result).toEqual({
            status: 'presented',
            presentation: { text: 'Unavailable', state: 'error' },
        });
        expect(present).toHaveBeenCalledWith({ text: 'Unavailable', state: 'error' });
    });

    test('does not update a Settings panel that closed while metadata was loading', async () => {
        let resolveVersion;
        const version = new Promise(resolve => {
            resolveVersion = resolve;
        });
        const present = jest.fn();
        let active = true;
        const loading = loadApplicationVersion({
            readVersion: () => version,
            present,
            isActive: () => active,
        });

        active = false;
        resolveVersion('1.7.0');

        await expect(loading).resolves.toEqual({
            status: 'cancelled',
            presentation: { text: '1.7.0', state: 'ready' },
        });
        expect(present).not.toHaveBeenCalled();
    });
});
