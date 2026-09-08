import { saveDirtyDocumentsBeforeExit } from './windowClose.js';

/** Install loss-prevention handlers synchronously; restore the timer alongside
 * essential startup settings. Optional writing/index services are not ports. */
export function installEditorSaveProtection({ listen, registerClose, loadInterval, configureInterval, tabs, activeId, activeContent, confirmClose, save, close, saveSession }) {
    let intervalChanged = false;
    listen('figaro:auto-save-interval', event => {
        intervalChanged = true;
        configureInterval(Number(event.detail?.seconds) || 0);
    });
    let closing = false;
    registerClose(async () => {
        if (closing) return;
        closing = true;
        try {
            const dirty = tabs().filter(tab => tab.dirty && tab.type === 'file');
            if (!dirty.length) { close(); return; }
            const choice = await confirmClose(dirty);
            if (choice === 'extra') { close(); return; }
            if (choice !== 'confirm') return;
            const saved = await saveDirtyDocumentsBeforeExit({ tabs: dirty, activeId: activeId(), activeContent, save, currentTabs: tabs });
            if (saved) close();
        } finally { closing = false; }
    });
    listen('beforeunload', async () => {
        configureInterval(0);
        for (const tab of tabs()) {
            if (!tab.dirty || tab.type !== 'file') continue;
            const content = tab.id === activeId() ? activeContent() : tab._content;
            if (typeof content === 'string') await save(tab, content).catch(() => {});
        }
        saveSession();
    });
    return Promise.resolve().then(loadInterval).then(interval => {
        if (!intervalChanged) configureInterval(interval);
    }).catch(() => {});
}
