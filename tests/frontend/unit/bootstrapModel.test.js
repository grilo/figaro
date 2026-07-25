import {
    DEBUG_BACKEND_AFTER_TRIES,
    startupBackendDecision,
} from '../frontend/js/core/bootstrapModel.js';

describe('bootstrap model', () => {
    test('starts as soon as the application backend is available', () => {
        expect(startupBackendDecision({
            hasBackend: true,
            protocol: 'wails:',
            tries: 0,
        })).toBe('start');
    });

    test('keeps waiting for a delayed native backend without installing debug services', () => {
        expect(startupBackendDecision({
            hasBackend: false,
            protocol: 'wails:',
            tries: DEBUG_BACKEND_AFTER_TRIES + 100,
        })).toBe('wait');
    });

    test('uses the debug backend only after the browser startup grace period', () => {
        expect(startupBackendDecision({
            hasBackend: false,
            protocol: 'http:',
            tries: DEBUG_BACKEND_AFTER_TRIES,
        })).toBe('wait');
        expect(startupBackendDecision({
            hasBackend: false,
            protocol: 'http:',
            tries: DEBUG_BACKEND_AFTER_TRIES + 1,
        })).toBe('debug');
    });
});
