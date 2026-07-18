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

        test('should restore expandedDirs from localStorage', () => {
            localStorage.setItem('expandedDirs', JSON.stringify(['folder1', 'folder2']));
            initState();
            expect(getState('expandedDirs')).toEqual(new Set(['folder1', 'folder2']));
        });

        test('should restore selectedCalDateStr from localStorage', () => {
            localStorage.setItem('selectedCalDate', '2024-01-15');
            initState();
            expect(getState('selectedCalDateStr')).toBe('2024-01-15');
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

        test('should save selectedCalDateStr to localStorage', () => {
            setState('selectedCalDateStr', '2024-01-15');
            persistState();
            expect(localStorage.getItem('selectedCalDate')).toBe('2024-01-15');
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
    });

    describe('auto-persist subscriptions', () => {
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

        test('should auto-persist openTabs as serializable subset', () => {
            state.openTabs = [
                { id: 'a.md', type: 'file', title: 'A', path: 'a.md', dirty: false, cursorState: { anchor: 0, head: 0 } },
                { id: 'calendar-x', type: 'calendar', title: 'Cal', dateStr: '2024-01-15' },
                { id: 'backlinks-x', type: 'backlinks', title: 'BL', targetPath: 'x.md' }
            ];
            state.activeTabId = 'a.md';
            setState('openTabs', [...state.openTabs]);
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
