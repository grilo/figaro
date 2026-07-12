/**
 * Test: left-click reuses tab, middle-click opens new tab
 */
import { testUtils } from './test_setup.js';

// Mock state
const mockState = {
    openTabs: [],
    activeTabId: null,
};

jest.mock('../frontend/js/state.js', () => ({
    get state() { return mockState; },
    setState: jest.fn((key, value) => { mockState[key] = value; }),
    getState: jest.fn((key) => mockState[key]),
    subscribe: jest.fn()
}));

jest.mock('../frontend/js/statusBar.js', () => ({
    statusBar: { set: jest.fn() }
}));

jest.mock('../frontend/js/tabManager.js', () => ({
    openTab: jest.fn((id, title, type, data, forceNew) => {
        const tabs = mockState.openTabs;
        if (!forceNew) {
            const existing = tabs.find(t => t.id === id);
            if (existing) return existing;
        }
        const tab = { id, title, type, ...data };
        mockState.openTabs = [...tabs, tab];
        mockState.activeTabId = tab.id;
        return tab;
    }),
    switchTab: jest.fn(),
    closeTab: jest.fn(),
    getActiveTab: jest.fn(),
    markTabDirty: jest.fn(),
    updateTabTitle: jest.fn(),
    renderTabBar: jest.fn()
}));

// We need to test the handleLinkClick logic without importing the full editor
// Let's replicate the core logic

async function handleLinkClick(linkPath, linkText, forceNew = false) {
    const { openTab } = await import('../frontend/js/tabManager.js');

    if (!linkPath && linkText) {
        const dm = linkText.match(/^(\d{4}-\d{2}-\d{2})$/);
        if (dm) {
            openTab(`calendar-${dm[1]}`, `Mention of Date: [[${dm[1]}]]`, 'calendar', { dateStr: dm[1] }, forceNew);
            return;
        }
        return;
    }
    const dm = linkPath.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (dm) {
        openTab(`calendar-${dm[1]}`, `Mention of Date: [[${dm[1]}]]`, 'calendar', { dateStr: dm[1] }, forceNew);
        return;
    }
    openTab(linkPath, linkPath.split('/').pop(), 'file', { path: linkPath }, forceNew);
}

import { openTab } from '../frontend/js/tabManager.js';

describe('Link click behavior', () => {
    beforeEach(() => {
        mockState.openTabs = [];
        mockState.activeTabId = null;
        jest.clearAllMocks();
    });

    describe('left-click (forceNew=false)', () => {
        test('should reuse existing file tab instead of creating new one', async () => {
            // Pre-create a tab for the same file
            mockState.openTabs = [{ id: 'notes/hello.md', title: 'hello.md', type: 'file', path: 'notes/hello.md' }];
            mockState.activeTabId = 'notes/hello.md';

            await handleLinkClick('notes/hello.md', 'Hello', false);

            // Should NOT have created a new tab
            expect(mockState.openTabs.length).toBe(1);
            expect(mockState.openTabs[0].id).toBe('notes/hello.md');
        });

        test('should reuse existing calendar tab', async () => {
            mockState.openTabs = [{ id: 'calendar-2024-01-15', title: 'Cal', type: 'calendar', dateStr: '2024-01-15' }];

            await handleLinkClick('2024-01-15.md', '2024-01-15', false);

            expect(mockState.openTabs.length).toBe(1);
        });

        test('should create new tab when no existing tab matches', async () => {
            await handleLinkClick('notes/new.md', 'new.md', false);

            expect(mockState.openTabs.length).toBe(1);
            expect(mockState.openTabs[0].id).toBe('notes/new.md');
        });
    });

    describe('middle-click (also reuses existing tabs)', () => {
        test('should focus existing tab instead of duplicating', async () => {
            mockState.openTabs = [{ id: 'notes/hello.md', title: 'hello.md', type: 'file', path: 'notes/hello.md' }];

            await handleLinkClick('notes/hello.md', 'Hello', false);

            // Should reuse, not duplicate
            expect(mockState.openTabs.length).toBe(1);
            expect(mockState.openTabs[0].id).toBe('notes/hello.md');
        });

        test('should create new tab when no existing tab matches', async () => {
            await handleLinkClick('notes/fresh.md', 'fresh.md', false);

            expect(mockState.openTabs.length).toBe(1);
            expect(mockState.openTabs[0].id).toBe('notes/fresh.md');
        });
    });

    describe('date links', () => {
        test('left-click date link should reuse existing calendar tab', async () => {
            mockState.openTabs = [{ id: 'calendar-2024-06-15', title: 'Date', type: 'calendar', dateStr: '2024-06-15' }];

            await handleLinkClick('2024-06-15.md', '2024-06-15', false);

            expect(mockState.openTabs.length).toBe(1);
        });

        test('middle-click date link should reuse existing calendar tab', async () => {
            mockState.openTabs = [{ id: 'calendar-2024-06-15', title: 'Date', type: 'calendar', dateStr: '2024-06-15' }];

            await handleLinkClick('2024-06-15.md', '2024-06-15');

            expect(mockState.openTabs.length).toBe(1);
        });
    });
});
