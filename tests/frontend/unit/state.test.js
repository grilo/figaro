/**
 * Unit tests for state.js
 * Run with: npx jest js/state.test.js
 */

import { state, setState, getState, subscribe, setStateProp, toggleState, initState, persistState } from '../frontend/js/state.js';

// Mock localStorage
const mockLocalStorage = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value.toString(); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();

Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// State defaults for proper reset
const DEFAULTS = {
    sidebarWidth: 280,
    rightSidebarWidth: 320,
    sidebarCollapsed: false,
    showEditorBreadcrumbs: false,
    pureTypewriterEnabled: true,
    pureFocusScope: 'off',
    pureAdaptiveTypographyEnabled: false,
    activeTabId: null,
    openTabs: [],
    pinnedTabs: [],
    selectedFilePath: null,
    selectedTreePath: null,
    selectedCalDateStr: null,
    kanbanDensity: 'comfortable',
    kanbanLayout: 'side-by-side',
    expandedDirs: new Set(),
    _restoredTabs: null,
    _restoredActiveTabId: null,
};

describe('State Management', () => {
    beforeEach(() => {
        // Reset state to defaults
        Object.keys(DEFAULTS).forEach(key => {
            if (DEFAULTS[key] instanceof Set) {
                state[key] = new Set();
            } else if (Array.isArray(DEFAULTS[key])) {
                state[key] = [];
            } else {
                state[key] = DEFAULTS[key];
            }
        });
        mockLocalStorage.clear();
        jest.clearAllMocks();
    });

    describe('getState / setState', () => {
        test('should get and set primitive values', () => {
            setState('sidebarWidth', 300);
            expect(getState('sidebarWidth')).toBe(300);
        });

        test('should get and set object values', () => {
            const obj = { a: 1, b: 2 };
            setState('testObj', obj);
            expect(getState('testObj')).toEqual({ a: 1, b: 2 });
        });

        test('should notify subscribers on change', () => {
            const callback = jest.fn();
            const unsubscribe = subscribe('sidebarWidth', callback);
            
            setState('sidebarWidth', 400);
            expect(callback).toHaveBeenCalledWith(400, 280);
            
            unsubscribe();
            setState('sidebarWidth', 500);
            expect(callback).toHaveBeenCalledTimes(1);
        });

        test('should not notify if value unchanged', () => {
            const callback = jest.fn();
            subscribe('sidebarWidth', callback);
            
            setState('sidebarWidth', 280); // Same as default
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('setStateProp', () => {
        test('should update nested property', () => {
            state.testObj = { a: 1, b: 2 };
            setStateProp('testObj', 'a', 10);
            expect(getState('testObj')).toEqual({ a: 10, b: 2 });
        });
    });

    describe('toggleState', () => {
        test('should toggle boolean values', () => {
            state.testBool = false;
            toggleState('testBool');
            expect(getState('testBool')).toBe(true);
            toggleState('testBool');
            expect(getState('testBool')).toBe(false);
        });
    });

    describe('initState', () => {
        test('should restore sidebarWidth from localStorage', () => {
            localStorage.setItem('sidebarWidth', '350');
            initState();
            expect(getState('sidebarWidth')).toBe(350);
        });

        test('restores and persists the collapsed sidebar across restarts', () => {
            localStorage.setItem('sidebarCollapsed', 'true');
            initState();
            expect(getState('sidebarCollapsed')).toBe(true);

            setState('sidebarCollapsed', false);
            expect(localStorage.getItem('sidebarCollapsed')).toBe('false');
        });

        test('should restore expandedDirs from localStorage', () => {
            localStorage.setItem('expandedDirs', JSON.stringify(['folder1', 'folder2']));
            initState();
            expect(getState('expandedDirs')).toEqual(new Set(['folder1', 'folder2']));
        });

        test('should discard the legacy cross-session Calendar selection', () => {
            localStorage.setItem('selectedCalDate', '2024-01-15');
            initState();
            expect(getState('selectedCalDateStr')).toBeNull();
            expect(localStorage.getItem('selectedCalDate')).toBeNull();
        });

        test('should restore pinnedTabs from localStorage', () => {
            localStorage.setItem('pinnedTabs', JSON.stringify(['tab1', 'tab2']));
            localStorage.setItem('openTabs', JSON.stringify([
                { id: 'tab1', type: 'file', title: 'Tab 1', path: 'tab1.md' },
                { id: 'tab2', type: 'file', title: 'Tab 2', path: 'tab2.md' },
            ]));
            initState();
            expect(getState('pinnedTabs')).toEqual(['tab1', 'tab2']);
        });

        test('drops a legacy Welcome pin from localStorage', () => {
            localStorage.setItem('pinnedTabs', JSON.stringify(['home', 'tab1']));
            localStorage.setItem('openTabs', JSON.stringify([
                { id: 'tab1', type: 'file', title: 'Tab 1', path: 'tab1.md' },
            ]));
            initState();
            expect(getState('pinnedTabs')).toEqual(['tab1']);
        });

        test('should restore selectedFilePath from localStorage', () => {
            localStorage.setItem('selectedFilePath', 'notes/hello.md');
            initState();
            expect(getState('selectedFilePath')).toBe('notes/hello.md');
        });

        test('should restore selectedTreePath from localStorage', () => {
            localStorage.setItem('selectedTreePath', 'notes/projects');
            initState();
            expect(getState('selectedTreePath')).toBe('notes/projects');
        });

        test('should restore Kanban presentation preferences from localStorage', () => {
            localStorage.setItem('kanbanDensity', 'compact');
            localStorage.setItem('kanbanLayout', 'stacked');

            initState();

            expect(getState('kanbanDensity')).toBe('compact');
            expect(getState('kanbanLayout')).toBe('stacked');
        });

        test('restores editor breadcrumbs only when explicitly enabled', () => {
            initState();
            expect(getState('showEditorBreadcrumbs')).toBe(false);

            localStorage.setItem('showEditorBreadcrumbs', 'true');
            initState();
            expect(getState('showEditorBreadcrumbs')).toBe(true);
        });

        test('restores Pure writing behavior with typewriter on and stronger focus opt-in', () => {
            initState();
            expect(getState('pureTypewriterEnabled')).toBe(true);
            expect(getState('pureFocusScope')).toBe('off');
            expect(getState('pureAdaptiveTypographyEnabled')).toBe(false);

            localStorage.setItem('pureTypewriterEnabled', 'false');
            localStorage.setItem('pureFocusScope', 'paragraph');
            localStorage.setItem('pureAdaptiveTypographyEnabled', 'true');
            initState();

            expect(getState('pureTypewriterEnabled')).toBe(false);
            expect(getState('pureFocusScope')).toBe('paragraph');
            expect(getState('pureAdaptiveTypographyEnabled')).toBe(true);
        });

        test('should restore openTabs to _restoredTabs', () => {
            const tabs = [{ id: 'hello.md', type: 'file', title: 'hello', path: 'hello.md' }];
            localStorage.setItem('openTabs', JSON.stringify(tabs));
            localStorage.setItem('activeTabId', 'hello.md');
            initState();
            expect(state._restoredTabs).toEqual(tabs);
            expect(state._restoredActiveTabId).toBe('hello.md');
        });

        test('drops a legacy Welcome tab from local restoration', () => {
            localStorage.setItem('openTabs', JSON.stringify([
                { id: 'home', type: 'home', title: 'Welcome' },
                { id: 'hello.md', type: 'file', title: 'hello', path: 'hello.md' },
            ]));
            localStorage.setItem('activeTabId', 'home');

            initState();

            expect(state._restoredTabs).toEqual([
                { id: 'hello.md', type: 'file', title: 'hello', path: 'hello.md' },
            ]);
            expect(state._restoredActiveTabId).toBeNull();
        });

        test('should handle corrupted localStorage gracefully', () => {
            localStorage.setItem('expandedDirs', 'invalid json');
            expect(() => initState()).not.toThrow();
        });
    });

    describe('persistState', () => {
        test('should save sidebarWidth to localStorage', () => {
            setState('sidebarWidth', 320);
            persistState();
            expect(localStorage.getItem('sidebarWidth')).toBe('320');
        });

        test('should save expandedDirs to localStorage', () => {
            setState('expandedDirs', new Set(['folder1', 'folder2']));
            persistState();
            const saved = JSON.parse(localStorage.getItem('expandedDirs'));
            expect(saved.sort()).toEqual(['folder1', 'folder2'].sort());
        });

        test('persists Pure writing behavior settings independently', () => {
            setState('pureTypewriterEnabled', false);
            setState('pureFocusScope', 'phrase');
            setState('pureAdaptiveTypographyEnabled', true);

            expect(localStorage.getItem('pureTypewriterEnabled')).toBe('false');
            expect(localStorage.getItem('pureFocusScope')).toBe('phrase');
            expect(localStorage.getItem('pureAdaptiveTypographyEnabled')).toBe('true');
        });

        test('should save pinnedTabs to localStorage', () => {
            setState('openTabs', [
                { id: 'tab1', type: 'file', title: 'Tab 1', path: 'tab1.md' },
                { id: 'tab2', type: 'file', title: 'Tab 2', path: 'tab2.md' },
            ]);
            setState('pinnedTabs', ['tab1', 'tab2']);
            persistState();
            const saved = JSON.parse(localStorage.getItem('pinnedTabs'));
            expect(saved).toEqual(['tab1', 'tab2']);
        });

        test('should keep selectedCalDateStr out of persisted state', () => {
            localStorage.setItem('selectedCalDate', '2023-12-31');
            setState('selectedCalDateStr', '2024-01-15');
            persistState();
            expect(localStorage.getItem('selectedCalDate')).toBeNull();
        });

        test('should save selectedTreePath to localStorage', () => {
            setState('selectedTreePath', 'notes/projects');
            persistState();
            expect(localStorage.getItem('selectedTreePath')).toBe('notes/projects');
        });

        test('should save Kanban presentation preferences to localStorage', () => {
            setState('kanbanDensity', 'compact');
            setState('kanbanLayout', 'stacked');
            persistState();

            expect(localStorage.getItem('kanbanDensity')).toBe('compact');
            expect(localStorage.getItem('kanbanLayout')).toBe('stacked');
        });

        test('should save the editor breadcrumb preference', () => {
            setState('showEditorBreadcrumbs', true);
            persistState();
            expect(localStorage.getItem('showEditorBreadcrumbs')).toBe('true');
        });
    });

    describe('auto-persist subscriptions', () => {
        test('cursor and buffer changes do not write synchronous tab storage', () => {
            setState('openTabs', [{ id: 'a.md', type: 'file', title: 'A', path: 'a.md' }]);
            setState('activeTabId', 'a.md');
            const write = jest.spyOn(localStorage, 'setItem');
            try {
                for (let head = 1; head <= 100; head++) {
                    setState('openTabs', state.openTabs.map(tab => ({
                        ...tab, cursorState: { anchor: head, head }, dirty: true, content: 'edited',
                    })));
                }
                expect(write).not.toHaveBeenCalled();
                setState('openTabs', state.openTabs.map(tab => ({ ...tab, title: 'Renamed' })));
                expect(write).toHaveBeenCalledTimes(1);
                expect(JSON.parse(localStorage.getItem('openTabs'))[0].title).toBe('Renamed');
                setState('openTabs', []);
                expect(localStorage.getItem('openTabs')).toBe('[]');
            } finally {
                write.mockRestore();
            }
        });

        test('should auto-persist sidebarWidth on change', () => {
            setState('sidebarWidth', 330);
            expect(localStorage.getItem('sidebarWidth')).toBe('330');
        });

        test('should auto-persist expandedDirs on change', () => {
            setState('expandedDirs', new Set(['newfolder']));
            const saved = JSON.parse(localStorage.getItem('expandedDirs'));
            expect(saved).toContain('newfolder');
        });

        test('should auto-persist pinnedTabs on change', () => {
            setState('openTabs', [{ id: 'pinned1', type: 'file', title: 'Pinned', path: 'pinned1.md' }]);
            setState('pinnedTabs', ['pinned1']);
            const saved = JSON.parse(localStorage.getItem('pinnedTabs'));
            expect(saved).toEqual(['pinned1']);
        });

        test('should auto-persist selectedFilePath on change', () => {
            setState('selectedFilePath', 'notes/test.md');
            expect(localStorage.getItem('selectedFilePath')).toBe('notes/test.md');
        });

        test('should remove selectedFilePath when set to null', () => {
            setState('selectedFilePath', 'some.md');
            setState('selectedFilePath', null);
            expect(localStorage.getItem('selectedFilePath')).toBeNull();
        });

        test('should auto-persist selectedTreePath on change', () => {
            setState('selectedTreePath', 'notes/projects');
            expect(localStorage.getItem('selectedTreePath')).toBe('notes/projects');
            setState('selectedTreePath', null);
            expect(localStorage.getItem('selectedTreePath')).toBeNull();
        });

        test('should auto-persist the editor breadcrumb preference', () => {
            setState('showEditorBreadcrumbs', true);
            expect(localStorage.getItem('showEditorBreadcrumbs')).toBe('true');
        });

        test('should auto-persist openTabs as serializable subset', () => {
            setState('openTabs', [
                { id: 'a.md', type: 'file', title: 'A', path: 'a.md', dirty: false, cursorState: { anchor: 0, head: 0 } },
                { id: 'calendar-x', type: 'calendar', title: 'Cal', dateStr: '2024-01-15' },
                { id: 'backlinks-x', type: 'backlinks', title: 'BL', targetPath: 'x.md' }
            ]);
            setState('activeTabId', 'a.md');
            const saved = JSON.parse(localStorage.getItem('openTabs'));
            expect(saved.length).toBe(2); // file + calendar only, no backlinks
            expect(saved[0].id).toBe('a.md');
            expect(saved[0].type).toBe('file');
            expect(saved[0].path).toBe('a.md');
            expect(saved[0].dirty).toBeUndefined(); // non-serializable excluded
            expect(saved[1].type).toBe('calendar');
            expect(saved[1].dateStr).toBe('2024-01-15');
            expect(localStorage.getItem('activeTabId')).toBe('a.md');
        });
    });
});


import { getTabCursorState, setTabCursorState, getTabIndex } from '../../../frontend/js/state.js';
import { recordTabEdit, recordTabContent } from '../../../frontend/js/tabManager.js';
test.each([10, 1000])('buffer publications touch one tab and preserve cursor lifetimes with %i tabs', count => {
    let reads = 0;
    const tabs = Array.from({ length: count }, (_, index) => ({
        get id() { reads++; return String(index); }, type: 'file', dirty: true, _editGeneration: 0,
        cursorState: { anchor: 2, head: 3 },
    }));
    setState('openTabs', tabs);
    const id = String(count - 1);
    setTabCursorState(id, { anchor: 7, head: 8 });
    const before = state.openTabs;
    const notify = jest.fn(), stop = subscribe('tabCursors', notify);
    reads = 0;
    try {
        for (let index = 0; index < 20; index++) {
            recordTabEdit(id);
            expect(recordTabContent(id, index + 1, 'content ' + index)).toBe(true);
        }
        expect(reads).toBeLessThan(100);
        expect(notify).not.toHaveBeenCalled();
        expect(getTabCursorState(id)).toEqual({ anchor: 7, head: 8 });
        expect(before.at(-1)._editGeneration).toBe(0);
        expect(state.openTabs.at(-1)._content).toBe('content 19');
        expect(recordTabContent(id, 19, 'stale')).toBe(false);
        setState('openTabs', [...state.openTabs].reverse());
        expect(getTabIndex(id)).toBe(0);
        recordTabEdit(id);
        expect(state.openTabs[0]._editGeneration).toBe(21);
        setState('openTabs', []);
        setState('openTabs', [{ id, type: 'file', cursorState: { anchor: 1, head: 1 } }]);
        expect(getTabCursorState(id)).toEqual({ anchor: 1, head: 1 });
    } finally { stop(); setState('openTabs', []); }
});
