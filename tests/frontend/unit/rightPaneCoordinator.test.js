import {
    claimRightPane,
    closeActiveRightPane,
    registerRightPaneMode,
    resetRightPaneModesForTests,
    switchRightPaneTab,
    restoreRightPaneTab,
} from '../../../frontend/js/rightPaneCoordinator.js';

describe('right pane ownership coordinator', () => {
    beforeEach(() => {
        resetRightPaneModesForTests();
        document.body.innerHTML = '<aside id="right-sidebar" data-mode="history"></aside>';
    });

    test('releases the current owner before a different mode claims the pane', () => {
        const sidebar = document.getElementById('right-sidebar');
        const closeHistory = jest.fn(() => { delete sidebar.dataset.mode; });
        registerRightPaneMode('history', closeHistory);

        expect(claimRightPane('outline', sidebar)).toBe(true);
        expect(closeHistory).toHaveBeenCalledWith({ keepSidebarOpen: true, restoreFocus: false });
        expect(sidebar.dataset.mode).toBeUndefined();
    });

    test('closes whichever registered mode currently owns the pane', () => {
        const sidebar = document.getElementById('right-sidebar');
        const closeHistory = jest.fn(() => { delete sidebar.dataset.mode; });
        registerRightPaneMode('history', closeHistory);

        expect(closeActiveRightPane({ sidebar, restoreFocus: true })).toBe(true);
        expect(closeHistory).toHaveBeenCalledWith({ restoreFocus: true });
    });

    test('rejects an unregistered owner instead of leaving two mounted modes', () => {
        const sidebar = document.getElementById('right-sidebar');
        expect(() => claimRightPane('outline', sidebar)).toThrow('has no registered owner');
    });
});


test('document pane selections restore after Settings, planning views and another note without stale restores', async () => {
    resetRightPaneModesForTests();
    document.body.innerHTML = '<aside id="right-sidebar"></aside>';
    const sidebar = document.getElementById('right-sidebar');
    const close = jest.fn(() => { delete sidebar.dataset.mode; sidebar.classList.remove('open'); });
    const open = jest.fn(() => { sidebar.dataset.mode = 'outline'; sidebar.classList.add('open'); });
    registerRightPaneMode('outline', close, open);
    switchRightPaneTab('note-a'); open();
    switchRightPaneTab('settings');
    expect(sidebar.classList.contains('open')).toBe(false);
    await restoreRightPaneTab('note-a', {}); expect(open).toHaveBeenCalledTimes(1);
    switchRightPaneTab('note-a'); await restoreRightPaneTab('note-a', { path: 'A.md' });
    expect(open).toHaveBeenLastCalledWith({ path: 'A.md' });
    switchRightPaneTab('kanban'); switchRightPaneTab('note-b');
    await restoreRightPaneTab('note-b', {}); expect(sidebar.classList.contains('open')).toBe(false);
    switchRightPaneTab('note-a'); await restoreRightPaneTab('note-a', {});
    expect(sidebar.dataset.mode).toBe('outline');
    closeActiveRightPane(); switchRightPaneTab('calendar-workspace'); switchRightPaneTab('note-a');
    await restoreRightPaneTab('note-a', {}); expect(sidebar.classList.contains('open')).toBe(false);
});
