/**
 * Tab lifetimes change infrequently. Cursor records change independently and
 * remain immutable; only explicit snapshots enumerate the workspace.
 */
export function createWorkspaceCursorStore() {
    let tabs = new Set();
    const cursors = new Map();
    const seeds = new Map();
    const same = (left, right) => left?.anchor === right?.anchor && left?.head === right?.head;
    const copy = value => Number.isInteger(value?.anchor) && Number.isInteger(value?.head)
        && value.anchor >= 0 && value.head >= 0 ? Object.freeze({ anchor: value.anchor, head: value.head }) : null;
    return {
        reconcile(nextTabs) {
            const next = new Set();
            const changes = [];
            for (const tab of (Array.isArray(nextTabs) ? nextTabs : [])) {
                if (tab?.type !== 'file') continue;
                next.add(tab.id);
                if (!tabs.has(tab.id) || !same(seeds.get(tab.id), tab.cursorState)) {
                    const cursor = copy(tab.cursorState);
                    const previous = cursors.get(tab.id) || null;
                    if (tabs.has(tab.id) && !same(previous, cursor)) changes.push({ tabId: tab.id, previous, cursorState: cursor });
                    if (cursor) cursors.set(tab.id, cursor);
                    else cursors.delete(tab.id);
                }
                seeds.set(tab.id, copy(tab.cursorState));
            }
            for (const id of tabs.keys()) {
                if (next.has(id)) continue;
                cursors.delete(id);
                seeds.delete(id);
            }
            tabs = next;
            return changes;
        },
        read(tabId) { return cursors.get(tabId) || null; },
        update(tabId, selection) {
            if (!tabs.has(tabId) || !Number.isInteger(selection?.anchor) || !Number.isInteger(selection?.head)
                || selection.anchor < 0 || selection.head < 0) return null;
            const previous = cursors.get(tabId) || null;
            if (same(previous, selection)) return null;
            const cursorState = copy(selection);
            cursors.set(tabId, cursorState);
            return { tabId, previous, cursorState };
        },
        snapshot() { return Object.fromEntries(cursors); },
    };
}
