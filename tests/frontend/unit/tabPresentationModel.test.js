import {
    compactTabTitle,
    tabAccessibleLabel,
    tabLocationLabel,
    tabBarRenderKey,
    titleBarTabs,
} from '../frontend/js/core/tabPresentationModel.js';

describe('tab presentation', () => {
    test('tab invalidation ignores editing metadata but includes every displayed property and order', () => {
        const tab = { id: 'a', type: 'file', title: 'A', path: 'A.md', dirty: true };
        const key = tabBarRenderKey([tab], 'a', []);
        expect(tabBarRenderKey([{ ...tab, _content: 'new text', _editGeneration: 8,
            cursorState: { anchor: 7, head: 8 }, mtime: 90 }], 'a', [])).toBe(key);
        for (const patch of [{ id: 'b' }, { type: 'settings' }, { title: 'B' },
            { path: 'folder/A.md' }, { dirty: false }]) {
            expect(tabBarRenderKey([{ ...tab, ...patch }], 'a', [])).not.toBe(key);
        }
        expect(tabBarRenderKey([tab], 'b', [])).not.toBe(key);
        expect(tabBarRenderKey([tab], 'a', ['a'])).not.toBe(key);
        const second = { ...tab, id: 'b' };
        expect(tabBarRenderKey([tab, second], 'a', []))
            .not.toBe(tabBarRenderKey([second, tab], 'a', []));
        expect(tabBarRenderKey([tab, { id: 'kanban', type: 'kanban', title: 'Board' }], 'a', []))
            .toBe(key);
    });
    test('keeps every sidebar-owned workspace out of the title-bar tab rail', () => {
        const tabs = [
            { id: 'notes/plan.md', type: 'file' },
            { id: 'calendar-workspace', type: 'calendar-workspace' },
            { id: 'kanban', type: 'kanban' },
            { id: 'graph', type: 'graph' },
            { id: 'settings', type: 'settings' },
        ];

        expect(titleBarTabs(tabs).map(tab => tab.id)).toEqual([
            'notes/plan.md',
            'settings',
        ]);
        expect(titleBarTabs(null)).toEqual([]);
    });

    test('preserves both differentiating ends of a long title', () => {
        const title = 'Quarterly planning and forecasting — Europe.md';
        const compact = compactTabTitle(title, 30);
        expect(compact.compacted).toBe(true);
        expect(compact.leading).toBe(title.slice(0, compact.leading.length));
        expect(compact.trailing).toBe(title.slice(-compact.trailing.length));
    });

    test('exposes full path context visually and to assistive technology', () => {
        const tab = { title: 'Shared name.md', path: 'Clients/Acme/Shared name.md' };
        expect(tabLocationLabel(tab)).toBe('Clients/Acme');
        expect(tabAccessibleLabel(tab)).toBe('Shared name.md — Clients/Acme/Shared name.md');
        expect(tabLocationLabel({ title: 'Root.md', path: 'Root.md' })).toBe('Vault root');
    });
});
