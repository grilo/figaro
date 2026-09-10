import { createWritingPathContinuity } from './usecases/writingPathContinuity.js';
import { movedWritingPath } from './core/writingPathModel.js';
import { createWritingDecision } from './core/writingDecisionsModel.js';
import { createWritingDecisions } from './usecases/writingDecisions.js';
import { createWritingDecisionsView } from './views/writingDecisionsView.js';
import { Transaction } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { writingEngineConfiguration } from './core/writingAnalysisModel.js';
import { createWritingAnalysis } from './usecases/writingAnalysis.js';
import { createWritingResultsView } from './views/writingResultsView.js';
import { writingLensesDocument, writingLensSupportsLanguage } from './core/writingLensesModel.js';
import { createWritingLensesApplyAll } from './usecases/writingLensesApplyAll.js';
import { createWritingLensesPreferences } from './usecases/writingLensesPreferences.js';
import { createWritingLensesView } from './views/writingLensesView.js';
import { claimRightPane, registerRightPaneMode } from './rightPaneCoordinator.js';
import { setRightSidebarOpen } from './rightSidebarState.js';
import { updateRightSidebarEditorLayout } from './historyPanel.js';
import { mountFloatingMenu } from './floatingMenu.js';
import { updateInlineWriting } from './writingInline.js';
import { selectedWritingLenses } from './core/writingAnalysisModel.js';
import { planWritingBulkFix } from './core/writingReviewModel.js';

/** Workspace adapter for owned snapshots, existing panes, and validated editor edits. */
export function initWritingLenses({ getActiveTab, getEditorDocumentTabId, focusEditor, loadPreferences, savePreferences, applyAllPreferences, loadDecisions = async () => [], changeDecisions = async () => { throw new Error('Review storage unavailable'); }, getView, analysisPorts, dictionary, dictionaryReady = Promise.resolve(), setSpelling = () => {} }) {
    const sidebar = document.getElementById('right-sidebar');
    const content = document.getElementById('right-sidebar-content');
    const launcher = document.getElementById('writing-lenses-toggle');
    const quick = document.getElementById('writing-lenses-quick-toggle');
    if (!sidebar || !content || !launcher || !quick) return null;
    const mode = 'writing-lenses';
    let dictionaryLoaded = false;
    const dictionaryRestored = dictionaryReady.finally(() => { dictionaryLoaded = true; refreshAnalysis(true); });
    let analysis, resultsView, lastDocument, lastSource = '', revision = 0;
    let inlineVersion, inlineDocument;
    let observedDocument, observedPath, decisionViewKey, refreshTimer;
    let disposed = false;
    let placement = null;
    let popupOpen = false;
    const activeDocument = () => writingLensesDocument(getActiveTab(), getEditorDocumentTabId());
    const isPure = () => document.getElementById('app')?.classList.contains('pure-editing-chrome');
    const panel = document.createElement('div');
    panel.id = 'writing-lenses-panel'; panel.className = 'writing-lenses-panel'; panel.hidden = true;
    content.append(panel);
    const popup = document.createElement('div');
    popup.id = 'writing-lenses-quick'; popup.className = 'ui-menu writing-lenses-quick'; popup.hidden = true;
    popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', 'Writing lenses');
    popup.innerHTML = '<div class="writing-lenses-quick-header"><strong>Writing lenses</strong><button type="button" class="ui-icon-button ui-icon-button--small" aria-label="Close writing lens picker">×</button></div>';
    document.body.append(popup);
    const viewOptions = {
        onChange: action => { if (!applyAll.snapshot().applying) preferences?.update(action); },
        onRetry: () => void (applyAll.snapshot().applyError ? applyAll.retry() : preferences?.retry()),
        onApplyAll: () => { if (preferences) void applyAll.apply(preferences.snapshot().preferences); },
    };
    const paneView = createWritingLensesView({ id: 'writing-lenses-pane', ...viewOptions });
    const quickView = createWritingLensesView({ id: 'writing-lenses-quick', ...viewOptions, compact: false, onLayout: () => placement?.position() });
    panel.append(paneView.element); popup.append(quickView.element);
    const documents = new Map();
    const continuity = createWritingPathContinuity({ remap(result) {
        const moved = [...documents.values()].filter(entry => movedWritingPath(entry.path, result) !== entry.path);
        for (const entry of moved) documents.delete(entry.path);
        for (const entry of moved) {
            entry.path = movedWritingPath(entry.path, result);
            const previous = documents.get(entry.path);
            previous?.controller.destroy(); previous?.review.destroy();
            documents.set(entry.path, entry);
        }
    } });
    let preferences, preferencePath, decisions;
    const decisionViews = [panel, popup].map((host, index) => {
        const view = createWritingDecisionsView({ id: `writing-saved-decisions-${index}`,
            onRestore: async (id, path) => { if (path !== preferencePath) throw new Error('Document changed'); return decisions.change({ action: 'remove', id }); },
            onRetry: () => decisions.retry(), onReconcile: () => decisions.reconcile(), onLayout: () => placement?.position() });
        host.append(view.element); return view;
    });
    function updateDecisionViews() {
        const state = decisions?.snapshot(), key = `${preferencePath}:${state?.version}`;
        if (key === decisionViewKey) return;
        decisionViewKey = key;
        decisionViews.forEach(view => view.update(state, preferencePath));
        placement?.position();
    }
    const applyAll = createWritingLensesApplyAll({
        entries: () => [...documents.values()], save: value => continuity.access({}, () => applyAllPreferences(value)),
        onChange: () => { if (!disposed && preferences) updatePreferencesViews(preferences.snapshot()); },
    });
    function updatePreferencesViews(snapshot) {
        const value = { ...snapshot, ...applyAll.snapshot(), documentKey: preferencePath };
        paneView.update(value); quickView.update(value); placement?.position();
    }
    function selectDocument() {
        const path = activeDocument()?.path;
        if (path === preferencePath) return;
        preferencePath = path;
        if (!path) { preferences = null; decisions = null; updateDecisionViews(); return; }
        if (!documents.has(path)) {
            const entry = { path };
            const controller = createWritingLensesPreferences({
                load: () => continuity.access(entry, loadPreferences), save: value => continuity.access(entry, current => savePreferences(current, value)),
                onChange(snapshot) {
                    if (disposed || entry.path !== preferencePath) return;
                    updatePreferencesViews(snapshot); refreshAnalysis(true);
                },
            });
            const review = createWritingDecisions({ load: () => continuity.access(entry, loadDecisions), change: command => continuity.access(entry, current => changeDecisions(current, command)), track: analysisPorts?.trackDecisions, schedule: setTimeout, unschedule: clearTimeout,
                onChange(_, reason) {
                    if (disposed || entry.path !== preferencePath) return;
                    updateDecisionViews(); refreshAnalysis(reason !== 'source');
                } });
            Object.assign(entry, { controller, review });
            documents.set(path, entry);
            preferences = controller; decisions = review;
            documents.get(path).ready = Promise.all([controller.restore(), review.restore()]);
        } else { preferences = documents.get(path).controller; decisions = documents.get(path).review; }
        updateDecisionViews();
        updatePreferencesViews(preferences.snapshot());
    }
    function editorSnapshot() {
        const tab = activeDocument(), view = getView?.();
        const saved = preferences?.snapshot();
        const reviewState = decisions?.snapshot();
        if (!dictionaryLoaded || !tab || tab.path !== preferencePath || !view || !saved || reviewState?.status === 'loading' || ['loading', 'load-error'].includes(saved.status)) return null;
        const selected = selectedWritingLenses(saved.preferences);
        if (lastDocument !== view.state.doc || (selected.length && lastSource === undefined)) {
            lastDocument = view.state.doc; lastSource = selected.length ? view.state.doc.toString() : undefined; revision++;
        }
        const language = saved.preferences.language;
        const effectiveSpelling = { language, words: dictionary?.words() || [],
            enabled: selectedWritingLenses(saved.preferences).includes('spelling') && writingLensSupportsLanguage('spelling', language) };
        const review = reviewState?.decisions || [];
        const decisionsPending = Boolean(reviewState?.tracking), decisionsFailed = reviewState?.status === 'tracking-error';
        return { id: tab.id, revision, source: lastSource ?? '', language, preferences: saved.preferences, decisions: review, decisionsPending, decisionsFailed,
            spelling: effectiveSpelling, configuration: JSON.stringify([writingEngineConfiguration, saved.preferences, language, effectiveSpelling, review, decisionsPending, decisionsFailed]) };
    }
    function refreshAnalysis(immediate = false) {
        analysis?.update(editorSnapshot(), { immediate });
        updateDecisionViews();
    }
    function currentAnalysis(previous = analysis.snapshot().analyzed) {
        if (lastDocument !== getView?.()?.state.doc) return false;
        const fresh = editorSnapshot();
        return fresh && fresh.id === previous?.id && fresh.revision === previous?.revision && fresh.configuration === previous?.configuration;
    }
    const actions = {
        applyAll(id, previous) {
            const count = currentAnalysis(previous) && analysis.fixAll(id, editorSnapshot(), fixes => getView().dispatch({
                changes: fixes.map(fix => ({ from: fix.from, to: fix.to, insert: fix.replacement })),
                annotations: [Transaction.userEvent.of('input.writing'), isolateHistory.of('full')],
            }));
            if (!count) refreshAnalysis(true);
            else getView().focus();
            resultsView.announce(count ? `Applied to ${count} occurrences in this document. Undo restores all of them.` : 'These suggestions need refreshing. Nothing was changed.');
            return count;
        },
        apply(id, index, previous) {
            const applied = currentAnalysis(previous) && analysis.fix(id, index, editorSnapshot(), fix => getView().dispatch({
                changes: { from: fix.from, to: fix.to, insert: fix.replacement },
                annotations: [Transaction.userEvent.of('input.writing'), isolateHistory.of('full')],
            }));
            if (!applied) refreshAnalysis(true);
            resultsView.announce(applied ? 'Suggestion applied. Undo restores the original wording.' : 'This suggestion needs refreshing. Nothing was changed.');
            return applied;
        },
        async remember(id, type, previous) {
            const store = decisions;
            await store.flushSource();
            if (!currentAnalysis(previous)) { refreshAnalysis(true); throw new Error('This suggestion needs refreshing. Nothing was changed.'); }
            const state = analysis.snapshot(), fresh = editorSnapshot();
            const finding = state.groups.flatMap(group => group.findings).find(item => item.id === id);
            const command = { action: 'add', decision: createWritingDecision(finding, fresh.source, fresh.language, type, crypto.randomUUID()) };
            await store.change(command);
        },
        ignore(id, previous) { return actions.remember(id, 'occurrence', previous); },
        acceptAcronym(id, previous) { return actions.remember(id, 'acronym', previous); },
        addWord: dictionary ? async (finding, previous) => {
            if (!currentAnalysis(previous) || finding.lens !== 'spelling') throw new Error('Suggestion changed');
            await dictionary.add(finding.actual); refreshAnalysis(true);
        } : undefined,
    };
    if (analysisPorts) {
        resultsView = createWritingResultsView({
            onNavigate(finding) {
                const fresh = editorSnapshot(), previous = analysis.snapshot().analyzed;
                if (!fresh || fresh.id !== previous?.id || fresh.revision !== previous?.revision || fresh.configuration !== previous?.configuration) { refreshAnalysis(true); return; }
                getView().dispatch({ selection: { anchor: finding.from, head: finding.to }, scrollIntoView: true }); focusEditor?.();
            },
            onApply: actions.apply,
            onApplyAll: actions.applyAll,
            onDismiss: actions.ignore, onAcceptAcronym: actions.acceptAcronym,
            onRetry: () => { analysisPorts.vale.retry?.(); analysis.retry(); },
        });
        panel.append(resultsView.element);
        analysis = createWritingAnalysis({ ...analysisPorts, schedule: setTimeout, unschedule: clearTimeout, onChange: value => {
            // An obsolete worker completion must not serialize the new buffer
            // or rebuild review DOM while the author is still typing.
            if (value.current && lastDocument !== getView?.()?.state.doc) return;
            if (!panel.hidden) resultsView.update(value);
            setSpelling(value.current?.spelling || { enabled: false });
            if (inlineVersion === value.resultVersion && inlineDocument === getView?.()?.state.doc) return;
            inlineVersion = value.resultVersion; inlineDocument = getView?.()?.state.doc;
            updateInlineWriting(getView?.(), currentAnalysis() ? value : null, {
                apply: (id, index) => actions.apply(id, index, value.analyzed),
                applyAll: id => actions.applyAll(id, value.analyzed),
                bulkCount: id => planWritingBulkFix(value, id, value.current)?.length || 0,
                ignore: id => actions.ignore(id, value.analyzed),
                acceptAcronym: id => actions.acceptAcronym(id, value.analyzed),
                addWord: dictionary ? finding => actions.addWord(finding, value.analyzed) : undefined,
            });
        } });
    }
    function closeQuick(restoreFocus = false) {
        if (!popupOpen) return;
        quickView.close(); popupOpen = false; popup.hidden = true;
        placement?.close(); placement = null;
        quick.setAttribute('aria-expanded', 'false');
        if (restoreFocus && activeDocument() && isPure()) quick.focus();
    }
    function refresh() {
        if (disposed) return;
        selectDocument();
        observeEditorSource();
        refreshAnalysis();
        const tab = activeDocument();
        launcher.hidden = !tab; quick.hidden = !tab || !isPure();
        launcher.setAttribute('aria-expanded', String(sidebar.dataset.mode === mode && sidebar.classList.contains('open')));
        launcher.setAttribute('aria-pressed', launcher.getAttribute('aria-expanded'));
        launcher.classList.toggle('is-open', sidebar.dataset.mode === mode && sidebar.classList.contains('open'));
        if (!tab) close({ restoreFocus: false });
        if (!tab || !isPure()) closeQuick();
    }
    function close({ keepSidebarOpen = false, restoreFocus = false } = {}) {
        const hadFocus = paneView.contains(document.activeElement) || panel.contains(document.activeElement);
        paneView.close(); panel.hidden = true;
        if (sidebar.dataset.mode === mode) {
            delete sidebar.dataset.mode;
            if (!keepSidebarOpen) {
                setRightSidebarOpen(sidebar, false);
                sidebar.style.width = ''; sidebar.style.minWidth = '';
                document.getElementById('right-sidebar-resizer')?.classList.remove('visible');
            }
            updateRightSidebarEditorLayout();
            window.dispatchEvent(new Event('resize'));
        }
        launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-pressed', 'false'); launcher.classList.remove('is-open');
        if (restoreFocus && hadFocus) {
            if (activeDocument() && !isPure()) launcher.focus();
            else focusEditor?.();
        }
    }
    function toggle() {
        if (!activeDocument()) return;
        if (isPure()) {
            if (popupOpen) { closeQuick(true); return; }
            updatePreferencesViews(preferences.snapshot()); popupOpen = true; popup.hidden = false;
            quick.setAttribute('aria-expanded', 'true');
            placement = mountFloatingMenu(quick, popup, { maximumWidth: 320, maximumHeight: 650 });
            quickView.focus(); return;
        }
        if (sidebar.dataset.mode === mode && sidebar.classList.contains('open')) { close({ restoreFocus: true }); return; }
        open(); paneView.focus();
    }
    function open() {
        selectDocument();
        if (!activeDocument() || !preferences) return;
        claimRightPane(mode, sidebar);
        sidebar.dataset.mode = mode; panel.hidden = false;
        if (analysis) resultsView.update(analysis.snapshot());
        document.getElementById('right-sidebar-title').textContent = 'Writing lenses';
        setRightSidebarOpen(sidebar, true); sidebar.classList.remove('collapsed');
        document.getElementById('right-sidebar-resizer')?.classList.add('visible');
        updatePreferencesViews(preferences.snapshot());
        updateRightSidebarEditorLayout(); window.dispatchEvent(new Event('resize'));
        refresh(); refreshAnalysis(true);
    }
    const unregister = registerRightPaneMode(mode, close, open);
    // A keystroke only captures an immutable document reference and change ranges.
    // Do not scan text or rebuild review DOM in the input task or its microtasks.
    function observeEditorSource(changes) {
        const tab = activeDocument(), doc = getView?.()?.state.doc;
        if (!doc || !tab || (doc === observedDocument && tab.path === observedPath)) return;
        const review = documents.get(tab.path)?.review;
        // The mount event can precede the deferred document-selection refresh.
        // Leave this snapshot unobserved until its controller can receive it.
        if (!review) return;
        observedDocument = doc; observedPath = tab.path;
        review.observeSource(() => doc.toString(), changes);
    }
    const queueRefresh = (delay = 0) => {
        if (disposed) return;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { refreshTimer = undefined; refresh(); }, typeof delay === 'number' ? delay : 0);
    };
    const onEditorUpdate = event => {
        if ((event.detail?.docChanged || event.detail?.writingChanges) && event.detail.documentTabId === activeDocument()?.id) {
            // Undo can restore the very same immutable Text object before the
            // deferred snapshot runs. Every authored transaction still owns a
            // new revision and has cleared the editor's inline findings.
            revision++;
            resultsView?.invalidate();
            observeEditorSource(event.detail.writingChanges);
            queueRefresh(100);
        }
    };
    const onPureChange = () => {
        if (isPure()) {
            const hadFocus = sidebar.contains(document.activeElement) || paneView.contains(document.activeElement);
            paneView.close();
            if (hadFocus) focusEditor?.();
        }
        refresh();
        if (!isPure() && preferences) updatePreferencesViews(preferences.snapshot());
    };
    const onOutside = event => {
        if (popupOpen && !popup.contains(event.target) && !quickView.contains(event.target) && !quick.contains(event.target)) closeQuick();
    };
    const onEscape = event => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (popupOpen) { event.preventDefault(); closeQuick(true); }
        else if (!panel.hidden && panel.contains(event.target)) { event.preventDefault(); close({ restoreFocus: true }); }
    };
    launcher.addEventListener('click', toggle); quick.addEventListener('click', toggle);
    const onCloseQuick = () => closeQuick(true);
    popup.querySelector('button').addEventListener('click', onCloseQuick);
    for (const event of ['tab-switched', 'active-tab-changed', 'figaro:spellcheck-changed']) document.addEventListener(event, queueRefresh);
    document.addEventListener('editor-view-updated', onEditorUpdate);
    document.addEventListener('figaro:pure-editing-chrome-changed', onPureChange);
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onEscape);
    const observer = new MutationObserver(queueRefresh);
    observer.observe(sidebar, { attributes: true, attributeFilter: ['class', 'data-mode'] });
    refresh();
    const ready = Promise.all([documents.get(preferencePath)?.ready, analysisPorts?.ready, dictionaryRestored]).then(async () => { await decisions?.flushSource(); refreshAnalysis(true); });
    return {
        toggle, refresh, ready, movePaths: continuity.move,
        destroy() {
            clearTimeout(refreshTimer);
            updateInlineWriting(getView?.(), null, {}); setSpelling({ enabled: false });
            analysis?.destroy(); analysisPorts?.destroy(); closeQuick(); close(); disposed = true; documents.forEach(({ controller, review }) => { controller.destroy(); review.destroy(); }); observer.disconnect(); unregister();
            launcher.removeEventListener('click', toggle); quick.removeEventListener('click', toggle);
            for (const event of ['tab-switched', 'active-tab-changed', 'figaro:spellcheck-changed']) document.removeEventListener(event, queueRefresh);
            document.removeEventListener('editor-view-updated', onEditorUpdate);
            document.removeEventListener('figaro:pure-editing-chrome-changed', onPureChange);
            document.removeEventListener('pointerdown', onOutside); document.removeEventListener('keydown', onEscape);
            paneView.destroy(); quickView.destroy(); panel.remove(); popup.remove();
        },
    };
}
