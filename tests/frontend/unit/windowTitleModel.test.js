import {
    FIGARO_APPLICATION_NAME,
    windowTitleForTab,
} from '../frontend/js/core/windowTitleModel.js';

describe('window title model', () => {
    test('puts the active document before the application name', () => {
        expect(windowTitleForTab({ title: 'Project brief.md' })).toBe('Project brief.md — Figaro');
        expect(windowTitleForTab({ title: '  Kanban  ' })).toBe('Kanban — Figaro');
        expect(windowTitleForTab(null)).toBe(FIGARO_APPLICATION_NAME);
    });
});
