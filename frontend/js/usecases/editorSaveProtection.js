import { readTabContent } from './tabContent.js';
import { isUnsavedDocumentTab, saveDirtyDocumentsBeforeExit } from './windowClose.js';

/** Install loss-prevention handlers synchronously; restore the timer alongside
 * essential startup settings. Optional writing/index services are not ports. */
export function installEditorSaveProtection({ listen, registerClose, loadInterval, configureInterval, tabs, activeId, activeContent, confirmClose, save, saveDrawing = async () => null, close, saveSession, nativeClose = null }) {
    let intervalChanged = false;
    listen('figaro:auto-save-interval', event => {
        intervalChanged = true;
        configureInterval(Number(event.detail?.seconds) || 0);
    });
    let closing = false;
    // Every way of leaving runs this one flow: the window button, a close the
    // operating system asks for, and the restart that installs an update.
    // `exit` is how this request leaves. Resolves true once Figaro is exiting,
    // false when it stays open, and undefined while an earlier request is
    // still being answered.
    const requestExit = async exit => {
        if (closing) return undefined;
        closing = true;
        try {
            const leave = typeof exit === 'function' ? exit : close;
            const dirty = tabs().filter(isUnsavedDocumentTab);
            // Note content is settled first; the workspace session follows.
            const finish = async () => { await saveSession(); await leave(); return true; };
            if (!dirty.length) return await finish();
            const choice = await confirmClose(dirty);
            if (choice === 'extra') return await finish();
            if (choice !== 'confirm') return false;
            const saved = await saveDirtyDocumentsBeforeExit({ tabs: dirty, activeId: activeId(), activeContent, save, saveDrawing, currentTabs: tabs });
            return saved ? await finish() : false;
        } finally { closing = false; }
    };
    registerClose(requestExit);
    // The host holds a native close (Alt+F4, the window manager, the macOS
    // close button or Quit) until this page answers. Acknowledging at once
    // tells it the page is alive; declining lets the next request ask again.
    nativeClose?.listen(async () => {
        nativeClose.acknowledge();
        // A flow that fails must not leave the host holding every later close.
        const exiting = await requestExit().catch(() => false);
        if (exiting === false) nativeClose.decline();
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
