import { backend } from './backend.js';
import { getState } from './state.js';
import { getEditorDocumentTabId, getEditorView } from './editor.js';
import { activityState, configureActivityGutter, currentActivityPassages, setActivityData } from './activityGutter.js';
import { createActivityReview } from './usecases/activityReview.js';
import { createActivityWorker } from './activityWorkerClient.js';
import { activityEventsForPassages, remapActivityScope } from './core/activityModel.js';
import { renderActivityView } from './views/activityView.js';
import { configureHistoryPaneTabs } from './historyPaneTabs.js';
import { claimRightPane, registerRightPaneMode } from './rightPaneCoordinator.js';
import { setRightSidebarOpen } from './rightSidebarState.js';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { unfoldEffect, foldedRanges } from '@codemirror/language';

let enabled = false, initialized = false, controller, selectedKey = null, lastResult = null;
let scope = null, lastTrigger = null;
const expanded = new Set(), scopes = new Map();
function ownedNote() {
    const tab = (getState('openTabs') || []).find(t => t.id === getState('activeTabId'));
    const view = getEditorView();
    return tab?.type === 'file' && /\.(md|markdown|mdown|mkdn)$/i.test(tab.path || '') && getEditorDocumentTabId() === tab.id && view && !view.isDestroyed && !view.dom.classList.contains('history-mode') ? { key: tab.id, path: tab.path, view } : null;
}
function paneOpen() { return document.getElementById('right-sidebar')?.dataset.mode === 'activity'; }
function setEditorData(value, expectedSource) {
    // Editor notifications may arrive inside CodeMirror's update; publish only
    // after that transaction completes, and only to the same owned document.
    const owner = ownedNote(); if (!owner) return;
    queueMicrotask(() => { if (ownedNote()?.key === owner.key && !owner.view.isDestroyed && (expectedSource === undefined || owner.view.state.doc.toString() === expectedSource)) owner.view.dispatch({ effects: setActivityData.of(value) }); });
}
function selectOwnedNote() {
    const owner = ownedNote();
    const openIds = new Set((getState('openTabs') || []).map(tab => tab.id));
    for (const id of scopes.keys()) if (!openIds.has(id)) scopes.delete(id);
    const key = owner && (enabled || paneOpen()) ? `${owner.key}:${owner.path}` : null;
    if (key === selectedKey) { if (owner && owner.view.state.field(activityState, false)?.enabled !== enabled) setEditorData({ enabled }); return; }
    selectedKey = key; lastResult = null; expanded.clear();
    scope = owner ? scopes.get(owner.key) || null : null;
    if (scope && (!owner || !scope.document.eq(owner.view.state.doc))) scope = null;
    if (owner) setEditorData({ clear: true, enabled, scope: paneOpen() ? scope : null, status: key ? 'loading' : 'idle' });
    controller?.select(key ? { key: owner.key, path: owner.path } : null);
}
export function setActivityDatesEnabled(value) { enabled = Boolean(value); if (initialized) selectOwnedNote(); }
function renderPane() {
    if (!paneOpen()) return;
    const owner = ownedNote(), container = document.getElementById('history-content');
    if (!owner || !container) return;
    const data = owner.view.state.field(activityState, false);
    renderActivityView(container, {
        status: lastResult?.status || 'loading', error: lastResult?.error || '',
        passages: currentActivityPassages(owner.view), events: data?.events || [], partial: data?.partial,
        scope, expanded,
        onRetry: () => controller.retry(),
        onToggle: id => { if (expanded.has(id)) expanded.delete(id); else expanded.add(id); renderPane(); },
        onJump: id => {
            const current = ownedNote(); if (!current) return;
            const passages = currentActivityPassages(current.view);
            const passage = passages.find(p => (!scope || (p.from < scope.to && p.to > scope.from)) && activityEventsForPassages([p], data.events).some(e => e.id === id));
            if (!passage) return;
            const effects = [];
            foldedRanges(current.view.state).between(passage.from, passage.to, (from, to) => effects.push(unfoldEffect.of({ from, to })));
            effects.push(EditorView.scrollIntoView(passage.from, { y: 'center' }));
            current.view.dispatch({ selection: EditorSelection.range(passage.from, passage.to), effects }); current.view.focus();
        },
    });
}
function openPane(group, trigger) {
    const owner = ownedNote(), sidebar = document.getElementById('right-sidebar');
    if (!owner || !sidebar) return;
    if (group === undefined) {
        scope = scopes.get(owner.key) || null;
        if (scope && !scope.document.eq(owner.view.state.doc)) scope = null;
    } else scope = group ? { from: group.from, to: group.to, document: owner.view.state.doc } : null;
    if (scope) scopes.set(owner.key, scope); else scopes.delete(owner.key);
    if (trigger) lastTrigger = trigger;
    claimRightPane('activity', sidebar);
    sidebar.dataset.mode = 'activity'; sidebar.classList.remove('pdf-preview-mode');
    document.getElementById('history-content').style.display = '';
    document.getElementById('right-sidebar-title').textContent = 'History';
    setRightSidebarOpen(sidebar, true); document.getElementById('right-sidebar-resizer')?.classList.add('visible');
    selectOwnedNote(); setEditorData({ scope }); renderPane(); window.dispatchEvent(new Event('resize'));
}
function closePane({ keepSidebarOpen = false, restoreFocus = true } = {}) {
    const sidebar = document.getElementById('right-sidebar'); if (sidebar?.dataset.mode !== 'activity') return;
    delete sidebar.dataset.mode;
    setEditorData({ scope: null });
    if (!keepSidebarOpen) { setRightSidebarOpen(sidebar, false); document.getElementById('right-sidebar-resizer')?.classList.remove('visible'); }
    if (restoreFocus && !keepSidebarOpen) {
        if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true }); else ownedNote()?.view.focus();
    }
    selectOwnedNote();
    window.dispatchEvent(new Event('resize'));
}
function remapScope(changes) {
    const owner = ownedNote();
    if (!scope || !owner) return;
    const mapped = remapActivityScope(scope, changes);
    scope = mapped ? { ...mapped, document: owner.view.state.doc } : null;
    if (scope) scopes.set(owner.key, scope); else scopes.delete(owner.key);
}
export function initActivity() {
    if (initialized) return; initialized = true;
    const worker = createActivityWorker();
    controller = createActivityReview({
        load: path => backend().GetFileActivity(path), project: input => worker.project(input), cancel: () => worker.cancel(),
        schedule: setTimeout, unschedule: clearTimeout, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        readSource: key => { const owner = ownedNote(); return owner?.key === key ? owner.view.state.doc.toString() : null; },
        publish(result) {
            if (ownedNote()?.key !== result.key) return;
            lastResult = result;
            setEditorData({ enabled, status: result.status, projection: result.projection, error: result.error }, result.source);
            queueMicrotask(renderPane);
        },
    });
    configureActivityGutter({ open: (_view, group, trigger) => openPane(group, trigger) });
    configureHistoryPaneTabs({ activity: () => openPane(null), activityAvailable: () => {
        const tab = (getState('openTabs') || []).find(item => item.id === getState('activeTabId'));
        return tab?.type === 'file' && /\.(md|markdown|mdown|mkdn)$/i.test(tab.path || '');
    } });
    registerRightPaneMode('activity', closePane, () => openPane(undefined));
    for (const type of ['active-tab-changed', 'tab-switched']) document.addEventListener(type, selectOwnedNote);
    document.addEventListener('editor-view-updated', event => {
        selectOwnedNote();
        if (event.detail?.docChanged && selectedKey) { remapScope(event.detail.writingChanges); controller.changed(); }
    });
    for (const type of ['vault-history-changed', 'vault-file-saved', 'vault-filesystem-changed']) document.addEventListener(type, event => {
        if (!event.detail?.path || event.detail.path === ownedNote()?.path) { selectOwnedNote(); if (selectedKey) controller.refresh(); }
    });
    document.addEventListener('figaro:pure-editing-chrome-changed', () => getEditorView()?.requestMeasure());
    window.addEventListener('beforeunload', () => { controller.destroy(); worker.destroy(); });
    selectOwnedNote();
    return worker.ready.catch(() => undefined);
}
