import {
    compactTabTitle,
    tabAccessibleLabel,
    tabLocationLabel,
} from '../frontend/js/core/tabPresentationModel.js';

describe('tab presentation', () => {
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
