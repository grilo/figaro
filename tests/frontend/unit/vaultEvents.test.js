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

        expect(registerVaultChangeEvents(runtime, { onVaultChanged, onKanbanIndexed })).toBe(true);
        expect(runtime.EventsOn).toHaveBeenCalledWith('vault:changed', expect.any(Function));
        expect(runtime.EventsOn).toHaveBeenCalledWith('vault:kanban-indexed', expect.any(Function));

        handlers['vault:changed']();
        handlers['vault:kanban-indexed']();

        expect(onVaultChanged).toHaveBeenCalledTimes(1);
        expect(onKanbanIndexed).toHaveBeenCalledTimes(1);
    });

    test('does not require a browser-specific event API when Wails is unavailable', () => {
        expect(registerVaultChangeEvents(undefined)).toBe(false);
        expect(registerVaultChangeEvents({})).toBe(false);
    });
});
