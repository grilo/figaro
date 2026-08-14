import {
    normalizeVaultLoadStatus,
    presentVaultLoadStatus,
} from '../frontend/js/core/vaultLoadingModel.js';

describe('vault loading presentation', () => {
    test('clamps native counts and presents determinate note progress', () => {
        expect(normalizeVaultLoadStatus({
            generation: 2,
            phase: 'loading',
            loaded: 100,
            total: 2072,
        })).toEqual({
            generation: 2,
            phase: 'loading',
            loaded: 100,
            total: 2072,
            error: '',
        });

        expect(presentVaultLoadStatus({
            generation: 2,
            phase: 'loading',
            loaded: 100,
            total: 2072,
        })).toMatchObject({
            title: 'Loading vault',
            message: 'Reading and indexing notes…',
            count: '100 / 2072 notes',
            percent: 5,
            ariaText: '100 of 2072 notes loaded',
            busy: true,
        });
    });

    test('distinguishes discovery, finalization, completion, and errors', () => {
        expect(presentVaultLoadStatus({ phase: 'discovering' })).toMatchObject({
            message: 'Discovering notes…',
            count: 'Preparing file list…',
            percent: null,
        });
        expect(presentVaultLoadStatus({ phase: 'finalizing', loaded: 3, total: 3 })).toMatchObject({
            message: 'Finalizing vault index…',
            percent: 100,
            busy: true,
        });
        expect(presentVaultLoadStatus({ phase: 'ready', loaded: 3, total: 3 })).toMatchObject({
            title: 'Vault ready',
            percent: 100,
            busy: false,
        });
        expect(presentVaultLoadStatus({ phase: 'ready', loaded: 0, total: 0 })).toMatchObject({
            count: '0 / 0 notes',
            percent: 100,
        });
        expect(presentVaultLoadStatus({ phase: 'error', error: 'permission denied' })).toMatchObject({
            title: 'Vault could not load',
            message: 'permission denied',
            busy: false,
        });
    });
});
