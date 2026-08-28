import { createStartupHydration } from '../frontend/js/usecases/startupHydration.js';

describe('startup hydration barrier', () => {
    test('starts independent state reads together and settles only after every port', async () => {
        const started = [];
        const resolvers = new Map();
        const loader = name => jest.fn(() => {
            started.push(name);
            return new Promise(resolve => resolvers.set(name, resolve));
        });
        const ports = {
            loadSession: loader('session'),
            loadTabSize: loader('tab-size'),
            loadLinkStyle: loader('link-style'),
            loadAutomation: loader('automation'),
            loadEditorPreferences: loader('editor-preferences'),
        };
        const hydration = createStartupHydration(ports);

        let settled = false;
        const first = hydration.hydrate().then(() => { settled = true; });
        const second = hydration.hydrate();

        expect(started).toEqual([
            'session',
            'tab-size',
            'link-style',
            'automation',
            'editor-preferences',
        ]);
        Object.values(ports).forEach(port => expect(port).toHaveBeenCalledTimes(1));
        expect(second).toBe(hydration.hydrate());

        for (const name of started.slice(0, -1)) resolvers.get(name)();
        await Promise.resolve();
        expect(settled).toBe(false);

        resolvers.get('editor-preferences')();
        await first;
        await second;
        expect(settled).toBe(true);
    });

    test('starts every port even when one throws, then rejects the barrier', async () => {
        const failure = new Error('settings unavailable');
        const ports = {
            loadSession: jest.fn().mockResolvedValue(undefined),
            loadTabSize: jest.fn().mockResolvedValue(undefined),
            loadLinkStyle: jest.fn().mockResolvedValue(undefined),
            loadAutomation: jest.fn(() => { throw failure; }),
            loadEditorPreferences: jest.fn().mockResolvedValue(undefined),
        };
        const hydration = createStartupHydration(ports);

        await expect(hydration.hydrate()).rejects.toBe(failure);
        Object.values(ports).forEach(port => expect(port).toHaveBeenCalledTimes(1));
    });
});
