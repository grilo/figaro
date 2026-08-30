import {
    buildSessionSnapshot,
    normalizeSessionPayload,
    restoredTabOpenArgs,
    restoredWorkspacePlan,
} from '../frontend/js/core/sessionModel.js';

describe('portable session model', () => {
    test('normalizes legacy selection and removes non-restorable tabs and pins', () => {
        expect(normalizeSessionPayload({
            openTabs: [
                { id: 'home', type: 'home', title: 'Welcome' },
                { id: 'note.md', type: 'file', title: 'Note', path: 'note.md' },
            ],
            activeTabId: 'home',
            selectedFilePath: 'note.md',
            pinnedTabs: ['home', 'note.md'],
            expandedDirs: ['Projects'],
        })).toEqual({
            expandedDirs: ['Projects'],
            selectedFilePath: 'note.md',
            selectedTreePath: 'note.md',
            openTabs: [{ id: 'note.md', type: 'file', title: 'Note', path: 'note.md' }],
            pinnedTabs: ['note.md'],
            activeTabId: null,
            cursorStates: null,
        });
    });

    test('builds the complete portable snapshot without external or session-only Graph tabs', () => {
        expect(buildSessionSnapshot({
            openTabs: [
                {
                    id: 'note.md',
                    type: 'file',
                    title: 'Note',
                    path: 'note.md',
                    cursorState: { anchor: 4, head: 9 },
                    _editorTextScale: 130,
                },
                {
                    id: 'external:1',
                    type: 'file',
                    title: 'External',
                    externalFileId: '1',
                },
                {
                    id: 'graph',
                    type: 'graph',
                    title: 'Graph',
                    anchorPath: 'note.md',
                },
            ],
            activeTabId: 'note.md',
            selectedFilePath: 'note.md',
            selectedTreePath: 'Projects',
            expandedDirs: ['Projects'],
            pinnedTabs: ['note.md', 'external:1'],
            theme: 'light',
        })).toEqual({
            openTabs: [{ id: 'note.md', type: 'file', title: 'Note', path: 'note.md' }],
            activeTabId: 'note.md',
            selectedFilePath: 'note.md',
            selectedTreePath: 'Projects',
            expandedDirs: ['Projects'],
            pinnedTabs: ['note.md'],
            cursorStates: { 'note.md': { anchor: 4, head: 9 } },
            theme: 'light',
        });
    });

    test('maps restored file and calendar tabs without I/O', () => {
        expect(restoredTabOpenArgs({
            id: 'calendar-2026-07-25',
            type: 'calendar',
            title: 'Today',
            dateStr: '2026-07-25',
        })).toEqual({
            id: 'calendar-2026-07-25',
            title: 'Today',
            type: 'calendar',
            data: { dateStr: '2026-07-25' },
        });
    });

    test('plans metadata-only tabs with one explicit active document', () => {
        expect(restoredWorkspacePlan([
            { id: 'one.md', type: 'file', title: 'One', path: 'one.md' },
            { id: 'two.md', type: 'file', title: 'Two', path: 'two.md' },
        ], 'one.md')).toEqual({
            tabs: [
                { id: 'one.md', title: 'One', type: 'file', data: { path: 'one.md' } },
                { id: 'two.md', title: 'Two', type: 'file', data: { path: 'two.md' } },
            ],
            activeTabId: 'one.md',
        });
    });

    test('falls back to the last restorable tab when the active id is stale', () => {
        expect(restoredWorkspacePlan([
            { id: 'note.md', type: 'file', title: 'Note', path: 'note.md' },
            { id: 'home', type: 'home', title: 'Legacy home' },
        ], 'missing.md').activeTabId).toBe('note.md');
    });
});
