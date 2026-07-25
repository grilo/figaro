import {
    buildSessionSnapshot,
    normalizeSessionPayload,
    restoredTabOpenArgs,
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

    test('builds the complete portable snapshot without external tabs', () => {
        expect(buildSessionSnapshot({
            openTabs: [
                {
                    id: 'note.md',
                    type: 'file',
                    title: 'Note',
                    path: 'note.md',
                    cursorState: { anchor: 4, head: 9 },
                },
                {
                    id: 'external:1',
                    type: 'file',
                    title: 'External',
                    externalFileId: '1',
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
});
