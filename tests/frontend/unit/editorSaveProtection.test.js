import { installEditorSaveProtection } from '../frontend/js/usecases/editorSaveProtection.js';

function harness(overrides = {}) {
    let requestClose, releaseSettings;
    const handlers = {}, tab = { id: 'note', path: 'note.md', type: 'file', title: 'Note', dirty: true, _content: 'draft' };
    const ports = {
        listen: (name, handler) => { handlers[name] = handler; },
        registerClose: handler => { requestClose = handler; },
        loadInterval: () => new Promise(resolve => { releaseSettings = resolve; }),
        configureInterval: jest.fn(), tabs: () => [tab], activeId: () => 'note', activeContent: () => 'latest text',
        confirmClose: jest.fn().mockResolvedValue('confirm'),
        save: jest.fn(async () => { tab.dirty = false; return { success: true }; }),
        close: jest.fn(), saveSession: jest.fn(), ...overrides,
    };
    const ready = installEditorSaveProtection(ports);
    return { ports, handlers, ready, close: () => requestClose(), release: value => releaseSettings(value), tab };
}

test('installs close protection before startup settings or optional services settle', async () => {
    const h = harness();
    await h.close();
    expect(h.ports.save).toHaveBeenCalledWith(h.tab, 'latest text', { failurePrompt: 'always' });
    expect(h.ports.close).toHaveBeenCalledTimes(1);
    h.release(15); await h.ready;
    expect(h.ports.configureInterval).toHaveBeenCalledWith(15);
});

test.each(['cancel', 'failed-save'])('startup close keeps the editor open after %s', async mode => {
    const h = harness(mode === 'cancel' ? { confirmClose: async () => false } : { save: async () => { throw new Error('disk full'); } });
    await h.close();
    expect(h.ports.close).not.toHaveBeenCalled();
    expect(h.tab.dirty).toBe(true);
});

test('an early interval choice supersedes a delayed startup read', async () => {
    const h = harness();
    h.handlers['figaro:auto-save-interval']({ detail: { seconds: 30 } });
    await Promise.resolve(); h.release(300); await h.ready;
    expect(h.ports.configureInterval.mock.calls).toEqual([[30]]);
});
