import { countEditorWork } from './editorDiagnostics.js';
import { subscribeEditorUpdates } from './editorUpdates.js';
import { closeActiveRightPane } from './rightPaneCoordinator.js';
import { bindRightPaneLauncher } from './rightPaneLauncher.js';

const markdownPath = /\.(?:md|markdown|mdown|mkdn)$/iu;

/**
 * Bind the editor's compact Raw/PDF launchers to injected preview use cases.
 * The adapter owns only availability and right-pane toggle state; each preview
 * module continues to own rendering, loading, cancellation, and teardown.
 */
export function initEditorPreviewLaunchers({
    getActiveTab,
    getEditorContent,
    getEditorDocumentTabId,
    getEditorView,
    openRawTextPreview,
    openPDFPreview,
    onError = () => {},
} = {}) {
    const raw = document.getElementById('raw-text-preview-toggle');
    const pdf = document.getElementById('pdf-preview-toggle');
    const sidebar = document.getElementById('right-sidebar');
    if (!raw || !pdf || !sidebar) return { refresh() {}, destroy() {} };

    const activeMarkdown = () => {
        const tab = getActiveTab?.();
        return tab?.type === 'file'
            && markdownPath.test(tab.path || '')
            && getEditorDocumentTabId?.() === tab.id
            ? tab
            : null;
    };

    const refresh = () => {
        const available = Boolean(activeMarkdown());
        const open = sidebar.classList.contains('open');
        for (const [button, mode] of [[raw, 'raw-text-preview'], [pdf, 'pdf-preview']]) {
            const expanded = open && sidebar.dataset.mode === mode;
            if (button.hidden !== !available) {
                countEditorWork('dom.previewControls');
                button.hidden = !available;
            }
            button.classList.toggle('is-open', expanded);
            for (const attribute of ['aria-expanded', 'aria-pressed']) {
                if (button.getAttribute(attribute) !== String(expanded)) {
                    countEditorWork('dom.previewControls');
                    button.setAttribute(attribute, String(expanded));
                }
            }
        }
    };

    const toggle = async (kind, button) => {
        const mode = kind === 'raw' ? 'raw-text-preview' : 'pdf-preview';
        if (sidebar.classList.contains('open') && sidebar.dataset.mode === mode) {
            closeActiveRightPane({ sidebar });
            refresh();
            return;
        }
        const tab = activeMarkdown();
        if (!tab || button.disabled) return;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
            const request = {
                path: tab.path,
                title: tab.title,
                content: getEditorContent?.() || '',
            };
            if (kind === 'raw') await openRawTextPreview(request);
            else await openPDFPreview(request);
        } catch (error) {
            onError(error, kind);
        } finally {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            refresh();
        }
    };

    const onRaw = () => void toggle('raw', raw);
    const onPDF = () => void toggle('pdf', pdf);
    let scheduled = false;
    let disposed = false;
    const onWorkspaceChange = () => {
        if (scheduled || disposed) return;
        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            if (!disposed) refresh();
        });
    };
    const unbindRaw = bindRightPaneLauncher(raw, { getEditorView, activate: onRaw });
    const unbindPDF = bindRightPaneLauncher(pdf, { getEditorView, activate: onPDF });
    for (const event of ['tab-switched', 'active-tab-changed']) {
        document.addEventListener(event, onWorkspaceChange);
    }
    const stopEditorUpdates = subscribeEditorUpdates('previews', refresh);
    const observer = new MutationObserver(refresh);
    observer.observe(sidebar, { attributes: true, attributeFilter: ['class', 'data-mode'] });
    refresh();

    return {
        refresh,
        destroy() {
            disposed = true;
            stopEditorUpdates();
            observer.disconnect();
            unbindRaw();
            unbindPDF();
            for (const event of ['tab-switched', 'active-tab-changed']) {
                document.removeEventListener(event, onWorkspaceChange);
            }
        },
    };
}
