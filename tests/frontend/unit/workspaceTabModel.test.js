import {
    acknowledgeWorkspaceFileSave,
    beginWorkspaceFileLoad,
    finishWorkspaceFileLoad,
    workspaceFileLoadIsCurrent,
    beginWorkspaceTabSave,
    recordWorkspaceTabContent,
    recordWorkspaceTabCursor,
    recordWorkspaceTabEdit,
    recordWorkspaceTabTextScale,
    resetWorkspaceTabTextScale,
    resetWorkspaceTabTextScales,
    restoreWorkspaceTabCursors,
} from '../../../frontend/js/core/workspaceTabModel.js';

describe('workspace tab model', () => {
    test('records edits and content snapshots without mutating the prior state', () => {
        const originalTab = { id: 'note.md', type: 'file', dirty: false, _editGeneration: 2 };
        const original = [originalTab];

        const edited = recordWorkspaceTabEdit(original, 'note.md');
        expect(edited.tab).toEqual(expect.objectContaining({ dirty: true, _editGeneration: 3 }));
        expect(edited.becameDirty).toBe(true);
        expect(original[0]).toBe(originalTab);
        expect(originalTab.dirty).toBe(false);

        const content = recordWorkspaceTabContent(edited.tabs, 'note.md', 3, 'current body');
        expect(content.tab._content).toBe('current body');
        expect(recordWorkspaceTabContent(content.tabs, 'note.md', 2, 'stale').changed).toBe(false);
    });

    test('applies and clears temporary editor scale without mutating tab records', () => {
        const originalTab = { id: 'a.md', type: 'file' };
        const original = [originalTab, { id: 'settings', type: 'settings' }];
        const scaled = recordWorkspaceTabTextScale(original, 'a.md', 120);
        expect(scaled.tab._editorTextScale).toBe(120);
        expect(originalTab).not.toHaveProperty('_editorTextScale');

        const reset = resetWorkspaceTabTextScale(scaled.tabs, 'a.md');
        expect(reset.tab._editorTextScale).toBeUndefined();
        expect(scaled.tab._editorTextScale).toBe(120);

        const allScaled = [
            { id: 'a.md', type: 'file', _editorTextScale: 130 },
            { id: 'b.md', type: 'file' },
        ];
        const allReset = resetWorkspaceTabTextScales(allScaled);
        expect(allReset[0]).not.toHaveProperty('_editorTextScale');
        expect(allReset[1]).toBe(allScaled[1]);
    });

    test('restores cursors and advances saves as immutable transitions', () => {
        const tabs = [{ id: 'a.md', type: 'file' }, { id: 'settings', type: 'settings' }];
        const restored = restoreWorkspaceTabCursors(tabs, {
            'a.md': { anchor: 4, head: 7 },
            settings: { anchor: 1, head: 1 },
        });
        expect(restored[0].cursorState).toEqual({ anchor: 4, head: 7 });
        expect(restored[1].cursorState).toBeUndefined();

        const cursor = recordWorkspaceTabCursor(restored, 'a.md', { anchor: 8, head: 8 });
        expect(cursor.tab.cursorState).toEqual({ anchor: 8, head: 8 });
        expect(restored[0].cursorState).toEqual({ anchor: 4, head: 7 });

        const saving = beginWorkspaceTabSave(cursor.tabs, 'a.md');
        expect(saving.tab._saveGeneration).toBe(1);
        expect(cursor.tab._saveGeneration).toBeUndefined();
    });
});


describe('file load revision ownership', () => {
    const original = { id: 'note', type: 'file', path: 'note.md', mtime: 10, dirty: false };
    const file = { content: 'loaded', mtime: 20 };

    test('finishes on the current immutable tab after cursor changes', () => {
        const loading = beginWorkspaceFileLoad([original], original.id);
        const cursor = recordWorkspaceTabCursor(loading.tabs, original.id, { anchor: 1, head: 1 });
        expect(workspaceFileLoadIsCurrent(cursor.tab, loading.tab, original.id)).toBe(true);
        const finished = finishWorkspaceFileLoad(cursor.tabs, loading.tab, file, original.id);
        expect(finished.tab).toMatchObject({ mtime: 20, _content: 'loaded', dirty: false, cursorState: { anchor: 1, head: 1 } });
        expect(original.mtime).toBe(10);
    });

    test('rejects an older read even when cursor updates separated two loads', () => {
        const first = beginWorkspaceFileLoad([original], original.id);
        const cursor = recordWorkspaceTabCursor(first.tabs, original.id, { anchor: 1, head: 1 });
        const second = beginWorkspaceFileLoad(cursor.tabs, original.id);
        expect(workspaceFileLoadIsCurrent(second.tab, first.tab, original.id)).toBe(false);
        expect(finishWorkspaceFileLoad(second.tabs, first.tab, file, original.id).changed).toBe(false);
    });

    test('never mounts over fresh edits and retains edits made during a successful mount', () => {
        const loading = beginWorkspaceFileLoad([original], original.id);
        const edited = recordWorkspaceTabEdit(loading.tabs, original.id);
        const content = recordWorkspaceTabContent(edited.tabs, original.id, 1, 'new typing');
        expect(workspaceFileLoadIsCurrent(content.tab, loading.tab, original.id)).toBe(false);
        expect(finishWorkspaceFileLoad(content.tabs, loading.tab, file, original.id).tab)
            .toMatchObject({ mtime: 20, dirty: true, _content: 'new typing' });
    });

    test('a later save prevents a late load from regressing the saved revision', () => {
        const loading = beginWorkspaceFileLoad([original], original.id);
        const saving = beginWorkspaceTabSave(loading.tabs, original.id);
        const saved = acknowledgeWorkspaceFileSave(saving.tabs, { path: original.path }, { mtime: 30 });
        expect(finishWorkspaceFileLoad(saved, loading.tab, file, original.id).changed).toBe(false);
        expect(saved[0].mtime).toBe(30);
    });

    test.each(['inactive', 'closed', 'renamed', 'external'])('rejects completion after ownership becomes %s', change => {
        const loading = beginWorkspaceFileLoad([original], original.id);
        const tabs = change === 'closed' ? [] : [{ ...loading.tab,
            ...(change === 'renamed' ? { path: 'renamed.md' } : {}),
            ...(change === 'external' ? { externalFileId: 'external-1' } : {}),
        }];
        expect(finishWorkspaceFileLoad(tabs, loading.tab, file, change === 'inactive' ? 'other' : original.id).changed).toBe(false);
    });

    test('acknowledges matching disk owners without clearing edits or updating other sources', () => {
        const tabs = [{ ...original, dirty: true, _content: 'new draft', _saveGeneration: 4 },
            { ...original, id: 'external', externalFileId: 'external-1' },
            { ...original, id: 'other', path: 'other.md' }];
        const saved = acknowledgeWorkspaceFileSave(tabs, { path: original.path, generation: 3 }, { mtime: 11 });
        expect(saved[0]).toMatchObject({ mtime: 11, dirty: true, _content: 'new draft', _saveGeneration: 4 });
        expect(saved[1]).toBe(tabs[1]);
        expect(saved[2]).toBe(tabs[2]);
    });
});
