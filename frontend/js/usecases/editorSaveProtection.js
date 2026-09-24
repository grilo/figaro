import { readTabContent } from './tabContent.js';
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
            // Note content is settled first; the workspace session follows.
            const finish = async () => { await saveSession(); close(); };
            if (!dirty.length) { await finish(); return; }
            const choice = await confirmClose(dirty);
            if (choice === 'extra') { await finish(); return; }
            if (choice !== 'confirm') return;
            const saved = await saveDirtyDocumentsBeforeExit({ tabs: dirty, activeId: activeId(), activeContent, save, currentTabs: tabs });
            if (saved) await finish();
        } finally { closing = false; }
    });
    listen('beforeunload', async () => {
        configureInterval(0);
        for (const tab of tabs()) {
            if (!tab.dirty || tab.type !== 'file') continue;
            const content = tab.id === activeId() ? activeContent() : readTabContent(tab);
            if (typeof content === 'string') await save(tab, content).catch(() => {});
        }
        saveSession();
    });
    return Promise.resolve().then(loadInterval).then(interval => {
        if (!intervalChanged) configureInterval(interval);
    }).catch(() => {});
}
