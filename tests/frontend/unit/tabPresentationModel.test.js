import {
    compactTabTitle,
    tabAccessibleLabel,
    tabLocationLabel,
    titleBarTabs,
} from '../frontend/js/core/tabPresentationModel.js';

describe('tab presentation', () => {
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
