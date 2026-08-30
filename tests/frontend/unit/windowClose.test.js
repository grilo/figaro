import { saveDirtyDocumentsBeforeExit } from '../frontend/js/usecases/windowClose.js';

describe('save dirty documents before native exit', () => {
    test('allows closing only after every dirty buffer is saved', async () => {
        const active = { id: 'active', type: 'file', dirty: true };
        const background = { id: 'background', type: 'file', dirty: true, _content: 'background body' };
        const save = jest.fn(async (tab, _content, options) => {
            expect(options).toEqual({ failurePrompt: 'always' });
            tab.dirty = false;
            return { success: true };
        });

        await expect(saveDirtyDocumentsBeforeExit({
            tabs: [active, background],
            activeId: 'active',
            activeContent: () => 'active body',
            save,
        })).resolves.toBe(true);
        expect(save.mock.calls.map(([, content]) => content)).toEqual(['active body', 'background body']);
    });

    test('refuses to close after a failed save and leaves the dirty buffer intact', async () => {
        const tab = { id: 'note', type: 'file', dirty: true };
        const save = jest.fn().mockRejectedValue(new Error('permission denied'));

        await expect(saveDirtyDocumentsBeforeExit({
            tabs: [tab],
            activeId: 'note',
            activeContent: () => 'unsaved body',
            save,
        })).resolves.toBe(false);
        expect(tab.dirty).toBe(true);
    });

    test('refuses to close if a newer edit appears while the write is finishing', async () => {
        const tab = { id: 'note', type: 'file', dirty: true };
        const save = jest.fn().mockResolvedValue({ success: true });

        await expect(saveDirtyDocumentsBeforeExit({
            tabs: [tab],
            activeId: 'note',
            activeContent: () => 'older snapshot',
            save,
        })).resolves.toBe(false);
    });

    test('rechecks earlier buffers after all requested writes finish', async () => {
        const first = { id: 'first', type: 'file', dirty: true, _content: 'first' };
        const second = { id: 'second', type: 'file', dirty: true, _content: 'second' };
        const save = jest.fn(async tab => {
            tab.dirty = false;
            if (tab === second) first.dirty = true;
            return { success: true };
        });

        await expect(saveDirtyDocumentsBeforeExit({
            tabs: [first, second],
            activeContent: () => '',
            save,
            currentTabs: () => [first, second],
        })).resolves.toBe(false);
        expect(first.dirty).toBe(true);
    });
});
