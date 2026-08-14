import { registerVaultChangeEvents } from '../frontend/js/vaultEvents.js';

describe('vault change event bridge', () => {
    test('uses Wails events to notify both external changes and completed indexing', () => {
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

        expect(registerVaultChangeEvents(runtime, {
            onVaultChanged,
            onKanbanIndexed,
            onHistoryChanged,
            onVaultLoadProgress,
        })).toBe(true);
        expect(runtime.EventsOn).toHaveBeenCalledWith('vault:changed', expect.any(Function));
        expect(runtime.EventsOn).toHaveBeenCalledWith('vault:kanban-indexed', expect.any(Function));
        expect(runtime.EventsOn).toHaveBeenCalledWith('vault:history-changed', expect.any(Function));
        expect(runtime.EventsOn).toHaveBeenCalledWith('vault:load-progress', expect.any(Function));

        handlers['vault:changed']({ tree_changed: false });
        handlers['vault:kanban-indexed']();
        handlers['vault:history-changed']();
        handlers['vault:load-progress']({ phase: 'loading', loaded: 100, total: 2072 });

        expect(onVaultChanged).toHaveBeenCalledWith({ tree_changed: false });
        expect(onKanbanIndexed).toHaveBeenCalledTimes(1);
        expect(onHistoryChanged).toHaveBeenCalledTimes(1);
        expect(onVaultLoadProgress).toHaveBeenCalledWith({ phase: 'loading', loaded: 100, total: 2072 });
    });

    test('does not require a browser-specific event API when Wails is unavailable', () => {
        expect(registerVaultChangeEvents(undefined)).toBe(false);
        expect(registerVaultChangeEvents({})).toBe(false);
    });
});
