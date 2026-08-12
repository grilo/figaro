import { backend } from './backend.js';
import { errorDialog } from './dialogs.js';
import { log } from './log.js';
import { statusBar } from './statusBar.js';

function deletedItemName(item) {
    return String(item?.path || '').replaceAll('\\', '/').split('/').pop() || 'item';
}

function formatDeletedTime(timestamp) {
    const date = new Date(Number(timestamp) * 1000);
    return Number.isNaN(date.getTime()) ? 'Deletion time unavailable' : date.toLocaleString();
}

/** Restore one durable recovery record and notify the file-tree adapter. */
export async function restoreRecentlyDeletedItem(id, name = 'item') {
    const finishActivity = statusBar.beginDelayedActivity(1000);
    statusBar.set(`Restoring “${name}”…`);
    try {
        const result = await backend().RestoreRecentlyDeleted(id);
        if (!result?.success) {
            statusBar.set('Restore failed');
            await errorDialog('Couldn’t restore item', result?.error, 'The archived item was not changed or replaced.');
            return false;
        }
        document.dispatchEvent(new CustomEvent('vault-tree-refresh-requested'));
        const restoredName = String(result.path || name).replaceAll('\\', '/').split('/').pop();
        const message = `Restored “${restoredName}”`;
        statusBar.set(message);
        statusBar.clearAfter(3000, message);
        return true;
    } catch (error) {
        log.error('Recently deleted restore failed:', error);
        statusBar.set('Restore failed');
        await errorDialog('Couldn’t restore item', error, 'The archived item was not changed or replaced.');
        return false;
    } finally {
        finishActivity();
    }
}

function renderRecentlyDeletedList(container, items, reload) {
    container.replaceChildren();
    if (!Array.isArray(items) || items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'settings-section-desc recently-deleted-empty';
        empty.textContent = 'No items have been deleted from this vault.';
        container.append(empty);
        return;
    }

    for (const item of items) {
        const row = document.createElement('div');
        row.className = 'recently-deleted-item';

        const copy = document.createElement('div');
        copy.className = 'recently-deleted-item-copy';
        const name = document.createElement('strong');
        name.className = 'recently-deleted-item-name';
        name.textContent = deletedItemName(item);
        const metadata = document.createElement('span');
        metadata.className = 'recently-deleted-item-meta';
        metadata.textContent = `${item.path} · ${formatDeletedTime(item.deleted_at)}`;
        copy.append(name, metadata);

        const restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'ui-button settings-action-btn';
        restore.textContent = 'Restore';
        restore.setAttribute('aria-label', `Restore ${item.path}`);
        restore.addEventListener('click', async () => {
            restore.disabled = true;
            restore.setAttribute('aria-busy', 'true');
            const restored = await restoreRecentlyDeletedItem(item.id, deletedItemName(item));
            if (restored) await reload();
            else if (restore.isConnected) {
                restore.disabled = false;
                restore.removeAttribute('aria-busy');
            }
        });
        row.append(copy, restore);
        container.append(row);
    }
}

/** Initialize the Settings → Vault care recovery list for one panel instance. */
export async function initRecentlyDeletedSettings(root) {
    const container = root?.querySelector?.('#recently-deleted-list');
    if (!container) return;
    let requestID = 0;
    const reload = async () => {
        const currentRequest = ++requestID;
        container.setAttribute('aria-busy', 'true');
        try {
            const items = await backend().GetRecentlyDeleted();
            if (currentRequest !== requestID || !container.isConnected) return;
            renderRecentlyDeletedList(container, items, reload);
        } catch (error) {
            if (currentRequest !== requestID || !container.isConnected) return;
            log.error('Could not load recently deleted items:', error);
            container.innerHTML = '<p class="ui-notice ui-notice--danger" role="alert">Recently deleted items could not be loaded.</p>';
        } finally {
            if (currentRequest === requestID && container.isConnected) container.removeAttribute('aria-busy');
        }
    };
    await reload();
}
