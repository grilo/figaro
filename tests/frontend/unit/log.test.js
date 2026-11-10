import { createNativeRuntime } from '../../../frontend/js/wailsRuntime.js';

function loadLogger(runtime) {
    let logger;
    window.runtime = runtime;
    jest.isolateModules(() => {
        logger = require('../../../frontend/js/log.js').log;
    });
    return logger;
}

describe('application logger', () => {
    let consoleSpies;

    beforeEach(() => {
        consoleSpies = ['log', 'info', 'warn', 'error'].map(level => (
            jest.spyOn(console, level).mockImplementation(() => {})
        ));
    });

    afterEach(() => {
        consoleSpies.forEach(spy => spy.mockRestore());
        delete window.runtime;
    });

    test('every level is safe on the desktop runtime surface, which publishes LogDebug alone', () => {
        const debug = jest.fn();
        const log = loadLogger(createNativeRuntime({ on: jest.fn(), openURL: jest.fn(), debug }));
        const failure = new Error('no space left on device');

        expect(() => {
            log.debug('opened');
            log.info('ready');
            log.warn('Could not refresh:', failure);
            log.error('Save failed:', failure);
        }).not.toThrow();

        expect(debug).toHaveBeenCalledWith('opened');
        expect(console.warn).toHaveBeenCalledWith('[WARN]', 'Could not refresh:', failure);
        expect(console.error).toHaveBeenCalledWith('[ERROR]', 'Save failed:', failure);
    });

    test('forwards a level the runtime publishes and survives a native logger that throws', () => {
        const LogError = jest.fn(() => { throw new Error('bridge closed'); });
        const log = loadLogger({ LogDebug: jest.fn(), LogError });

        expect(() => log.error('Save failed:', new Error('disk full'))).not.toThrow();
        expect(LogError).toHaveBeenCalledWith('Save failed: Error: disk full');
    });

    test('logs to the console alone when no native runtime is present', () => {
        const log = loadLogger(undefined);

        expect(() => log.error('Failed to load backlinks: vault is unavailable')).not.toThrow();
        expect(console.error).toHaveBeenCalledWith('[ERROR]', 'Failed to load backlinks: vault is unavailable');
    });
});
