import { createNoteMerge } from '../frontend/js/usecases/noteMerge.js';

function ports(overrides = {}) {
    const calls = [];
    const record = (name, value) => (...args) => { calls.push([name, ...args]); return value; };
    return {
        calls,
        prepareTabs: record('prepare', { success: true }),
        merge: record('merge', { success: true }),
        closeDeletedTabs: record('close'),
        reloadTabs: record('reload', true),
        ...overrides,
    };
}

describe('Merge Notes with open editors', () => {
    test('saves the open notes, merges, closes the merged-away tabs and reloads the surviving note', async () => {
        const effects = ports();
        const mergeNotes = createNoteMerge(effects);

        await expect(mergeNotes(['keep.md', 'a.md', 'b.md'])).resolves.toEqual({ success: true, master: 'keep.md' });

        expect(effects.calls).toEqual([
            ['prepare', ['keep.md', 'a.md', 'b.md']],
            ['merge', ['keep.md', 'a.md', 'b.md']],
            ['close', 'a.md'],
            ['close', 'b.md'],
            ['reload', ['keep.md']],
        ]);
    });

    test('a note that cannot be saved stops the merge before anything changes', async () => {
        const effects = ports();
        effects.prepareTabs = jest.fn(async () => ({ success: false, error: 'Could not save "a.md" before merging it' }));
        const mergeNotes = createNoteMerge(effects);

        await expect(mergeNotes(['keep.md', 'a.md'])).resolves.toEqual({
            success: false, error: 'Could not save "a.md" before merging it',
        });
        expect(effects.calls).toEqual([]);
    });

    test('a refused merge leaves every tab open and untouched', async () => {
        const effects = ports();
        effects.merge = jest.fn(async () => ({ success: false, error: 'Need at least 2 notes to merge' }));
        const mergeNotes = createNoteMerge(effects);

        await expect(mergeNotes(['keep.md', 'a.md'])).resolves.toEqual({
            success: false, error: 'Need at least 2 notes to merge',
        });
        expect(effects.calls).toEqual([['prepare', ['keep.md', 'a.md']]]);
    });

    test('fewer than two notes is refused without touching any port', async () => {
        const effects = ports();
        const mergeNotes = createNoteMerge(effects);
        expect((await mergeNotes(['only.md'])).success).toBe(false);
        expect((await mergeNotes(null)).success).toBe(false);
        expect(effects.calls).toEqual([]);
    });
});
