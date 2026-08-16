import { registerVaultChangeEvents } from '../frontend/js/vaultEvents.js';

describe('vault change event bridge', () => {
    test('uses Wails events to notify vault changes, completed indexing, and forwarded launch files', () => {
        const handlers = {};
        const runtime = {
            EventsOn: jest.fn((name, handler) => {
                handlers[name] = handler;
            }),
        };
        const onVaultChanged = jest.fn();
        const onKanbanIndexed = jest.fn();
        const onHistoryChanged = jest.fn();
        const onVaultLoadProgress = jest.fn();
        const onExternalFilesOpened = jest.fn();

        expect(registerVaultChangeEvents(runtime, {
            onVaultChanged,
            onKanbanIndexed,
            onHistoryChanged,
            onVaultLoadProgress,
            onExternalFilesOpened,
        })).toBe(true);
        expect(runtime.EventsOn).toHaveBeenCalledWith('vault:changed', expect.any(Function));
        expect(runtime.EventsOn).toHaveBeenCalledWith('vault:kanban-indexed', expect.any(Function));
        expect(runtime.EventsOn).toHaveBeenCalledWith('vault:history-changed', expect.any(Function));
        expect(runtime.EventsOn).toHaveBeenCalledWith('vault:load-progress', expect.any(Function));
        expect(runtime.EventsOn).toHaveBeenCalledWith('launch:external-files', expect.any(Function));

        handlers['vault:changed']({ tree_changed: false });
        handlers['vault:kanban-indexed']();
        handlers['vault:history-changed']();
        handlers['vault:load-progress']({ phase: 'loading', loaded: 100, total: 2072 });
        handlers['launch:external-files']([{ id: 'external-2', path: 'C:\\Notes\\forwarded.md' }]);

        expect(onVaultChanged).toHaveBeenCalledWith({ tree_changed: false });
        expect(onKanbanIndexed).toHaveBeenCalledTimes(1);
        expect(onHistoryChanged).toHaveBeenCalledTimes(1);
        expect(onVaultLoadProgress).toHaveBeenCalledWith({ phase: 'loading', loaded: 100, total: 2072 });
        expect(onExternalFilesOpened).toHaveBeenCalledWith([
            { id: 'external-2', path: 'C:\\Notes\\forwarded.md' },
        ]);
    });

    test('does not require a browser-specific event API when Wails is unavailable', () => {
        expect(registerVaultChangeEvents(undefined)).toBe(false);
        expect(registerVaultChangeEvents({})).toBe(false);
    });
});
