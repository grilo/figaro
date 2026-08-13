import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { bracketMatching } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { lintKeymap, setDiagnostics } from '@codemirror/lint';

import { activateModal, createDialogShell } from './dialogs.js';
import { renderDiagramSVG, validateMermaidSource } from './diagramRenderer.js';
import { scanDiagramFences } from './liveDiagramPlugin.js';
import {
    initialMermaidTemplateState,
    mermaidBlockReplacement,
    mermaidCatalogueType,
    mermaidTemplateCatalog,
} from './core/mermaidEditorModel.js';
import { enhanceSelectCombobox } from './selectCombobox.js';
import { createMermaidPreviewNavigation } from './mermaidPreviewNavigation.js';
import { createMermaidPreviewSession } from './usecases/mermaidPreviewSession.js';
import { diagramData } from '../vendored/mermaid-examples/index.js';

export const mermaidTemplates = mermaidTemplateCatalog(diagramData);

function replaceEditorDocument(view, source) {
    view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: source },
        selection: { anchor: 0 },
    });
    view.focus();
}

function currentMermaidBlock(mainView, originalBlock) {
    return scanDiagramFences(mainView.state.doc).find(block => (
        block.lang === 'mermaid'
        && block.from === originalBlock.from
        && block.to === originalBlock.to
    )) || null;
}

/** Open the focused, transactional editor for one Mermaid fence. */
export function openMermaidEditor(mainView, originalBlock, options = {}) {
    if (!mainView || !originalBlock) return null;
    const catalog = options.catalog || mermaidTemplates;
    const parse = options.parse || validateMermaidSource;
    const render = options.render || (source => renderDiagramSVG('mermaid', source, 'figaro-mermaid-editor'));
    const { overlay } = createDialogShell({
        title: 'Mermaid Editor',
        description: 'Choose a starting point, edit the source, and review the live result.',
        icon: 'edit',
        className: 'mermaid-editor-modal',
        content: '<div class="mermaid-editor-workspace"></div>',
        footer: `
            <span class="mermaid-editor-apply-note" aria-live="polite"></span>
            <button type="button" class="ui-button custom-modal-btn mermaid-editor-cancel">Cancel</button>
            <button type="button" class="ui-button ui-button--primary custom-modal-btn mermaid-editor-apply">Apply</button>
        `,
    });
    const workspace = overlay.querySelector('.mermaid-editor-workspace');
    const cancelButton = overlay.querySelector('.mermaid-editor-cancel');
    const applyButton = overlay.querySelector('.mermaid-editor-apply');
    const applyNote = overlay.querySelector('.mermaid-editor-apply-note');

    const templateBar = document.createElement('div');
    templateBar.className = 'mermaid-editor-template-controls';
    const diagramLabel = document.createElement('label');
    diagramLabel.className = 'mermaid-editor-template-label';
    diagramLabel.textContent = 'Diagram';
    const diagramSelect = document.createElement('select');
    diagramSelect.className = 'ui-field mermaid-editor-diagram-select';
    for (const diagram of catalog) {
        const option = document.createElement('option');
        option.value = diagram.id;
        option.textContent = diagram.name;
        diagramSelect.append(option);
    }
    diagramLabel.append(diagramSelect);
    const templateLabel = document.createElement('label');
    templateLabel.className = 'mermaid-editor-template-label';
    templateLabel.textContent = 'Template';
    const templateSelect = document.createElement('select');
    templateSelect.className = 'ui-field mermaid-editor-template-select';
    const loadTemplateButton = document.createElement('button');
    loadTemplateButton.type = 'button';
    loadTemplateButton.className = 'ui-button mermaid-editor-load-template';
    loadTemplateButton.textContent = 'Replace with template';
    templateLabel.append(templateSelect);
    templateBar.append(diagramLabel, templateLabel, loadTemplateButton);

    const panes = document.createElement('div');
    panes.className = 'mermaid-editor-panes';
    const sourcePane = document.createElement('section');
    sourcePane.className = 'mermaid-editor-pane mermaid-editor-source-pane';
    sourcePane.setAttribute('aria-label', 'Mermaid source');
    const sourceHeading = document.createElement('h4');
    sourceHeading.textContent = 'Code';
    const codeHost = document.createElement('div');
    codeHost.className = 'mermaid-editor-code-host';
    const diagnosticStatus = document.createElement('p');
    diagnosticStatus.className = 'mermaid-editor-diagnostic-status';
    diagnosticStatus.setAttribute('role', 'status');
    diagnosticStatus.setAttribute('aria-live', 'polite');
    sourcePane.append(sourceHeading, codeHost, diagnosticStatus);

    const previewPane = document.createElement('section');
    previewPane.className = 'mermaid-editor-pane mermaid-editor-preview-pane';
    previewPane.setAttribute('aria-label', 'Mermaid preview');
    const previewHeading = document.createElement('div');
    previewHeading.className = 'mermaid-editor-preview-heading';
    const previewTitle = document.createElement('h4');
    previewTitle.textContent = 'Live preview';
    const previewActivity = document.createElement('span');
    previewActivity.className = 'mermaid-editor-preview-activity';
    previewActivity.innerHTML = '<span class="ui-spinner" hidden aria-hidden="true"></span><span class="mermaid-editor-preview-state">Waiting</span>';
    previewHeading.append(previewTitle, previewActivity);
    const preview = document.createElement('div');
    preview.className = 'mermaid-editor-preview';
    preview.setAttribute('aria-live', 'polite');
    const previewEmpty = document.createElement('p');
    previewEmpty.className = 'mermaid-editor-preview-empty';
    previewEmpty.textContent = 'A valid diagram preview will appear here.';
    preview.append(previewEmpty);
    const previewNavigation = createMermaidPreviewNavigation(preview, { emptyElement: previewEmpty });
    const staleNotice = document.createElement('p');
    staleNotice.className = 'ui-notice ui-notice--warning mermaid-editor-stale-notice';
    staleNotice.textContent = 'Preview paused at the last valid version while the source has errors.';
    staleNotice.hidden = true;
    previewPane.append(previewHeading, preview, staleNotice);
    panes.append(sourcePane, previewPane);
    workspace.append(templateBar, panes);

    const initialTemplateState = initialMermaidTemplateState(
        catalog,
        String(originalBlock.rawCode ?? originalBlock.code ?? ''),
    );
    let selectedType = initialTemplateState.diagram;
    let selectedExample = initialTemplateState.example;
    let protectedSource = initialTemplateState.protectedSource;
    let internalDocumentChange = false;
    let templateSelectionTouched = false;
    let editorView = null;
    let previewSession = null;
    let lifecycle = null;
    let settled = false;
    let hasPreview = false;
    let hasErrors = false;
    let detachInputProfile = null;

    const refreshTemplateOptions = () => {
        templateSelect.replaceChildren();
        for (const example of selectedType?.examples || []) {
            const option = document.createElement('option');
            option.value = example.id;
            option.textContent = example.title;
            templateSelect.append(option);
        }
        templateSelect.value = selectedExample?.id || selectedType?.examples?.[0]?.id || '';
        templateSelect._figaroCombobox?.refresh();
    };
    const updateTemplateReplacementState = () => {
        loadTemplateButton.disabled = !protectedSource || !selectedExample;
        loadTemplateButton.title = protectedSource
            ? 'Replace the current source with the selected template'
            : 'The editor already contains the selected template';
    };
    const selectType = (type) => {
        if (!type) return false;
        selectedType = type;
        selectedExample = type.examples[0] || null;
        diagramSelect.value = type.id;
        diagramSelect._figaroCombobox?.sync();
        refreshTemplateOptions();
        updateTemplateReplacementState();
        return true;
    };
    diagramSelect.value = selectedType?.id || '';
    refreshTemplateOptions();
    enhanceSelectCombobox(diagramSelect, {
        className: 'mermaid-editor-combobox',
        ariaLabel: 'Diagram',
    });
    enhanceSelectCombobox(templateSelect, {
        className: 'mermaid-editor-combobox',
        ariaLabel: 'Template',
    });
    updateTemplateReplacementState();

    const finish = (apply) => {
        if (settled) return false;
        if (apply) {
            const block = currentMermaidBlock(mainView, originalBlock);
            const change = mermaidBlockReplacement(block, editorView.state.doc.toString(), mainView.state.lineBreak);
            if (!change) {
                diagnosticStatus.textContent = 'The original Mermaid block changed. Close and reopen the editor.';
                diagnosticStatus.classList.add('is-error');
                return false;
            }
            mainView.dispatch({ changes: change });
        }
        settled = true;
        previewSession?.destroy();
        previewNavigation.destroy();
        detachInputProfile?.();
        editorView?.destroy();
        lifecycle.close(false);
        mainView.focus();
        return true;
    };

    editorView = new EditorView({
        parent: codeHost,
        state: EditorState.create({
            doc: initialTemplateState.source,
            extensions: [
                lineNumbers(),
                highlightActiveLineGutter(),
                history(),
                bracketMatching(),
                drawSelection(),
                highlightActiveLine(),
                EditorView.lineWrapping,
                EditorView.contentAttributes.of({
                    'aria-label': 'Mermaid source code',
                    spellcheck: 'false',
                }),
                EditorView.updateListener.of(update => {
                    if (!update.docChanged) return;
                    if (!internalDocumentChange) {
                        protectedSource = true;
                        updateTemplateReplacementState();
                    }
                    previewSession?.schedule(update.state.doc.toString());
                }),
                ...(options.inputProfile?.extensions || []),
                keymap.of([
                    ...defaultKeymap,
                    ...historyKeymap,
                    indentWithTab,
                    ...lintKeymap,
                    { key: 'Mod-Enter', run: () => finish(true) },
                ]),
            ],
        }),
    });

    const applySelectedTemplate = () => {
        if (!selectedExample) return false;
        internalDocumentChange = true;
        replaceEditorDocument(editorView, selectedExample.code);
        internalDocumentChange = false;
        protectedSource = false;
        updateTemplateReplacementState();
        return true;
    };
    const browseSelectedTemplate = () => {
        if (!protectedSource) applySelectedTemplate();
    };
    diagramSelect.addEventListener('change', () => {
        templateSelectionTouched = true;
        if (selectType(catalog.find(type => type.id === diagramSelect.value))) browseSelectedTemplate();
    });
    templateSelect.addEventListener('change', () => {
        templateSelectionTouched = true;
        selectedExample = selectedType?.examples.find(example => example.id === templateSelect.value)
            || selectedType?.examples[0]
            || null;
        updateTemplateReplacementState();
        browseSelectedTemplate();
    });

    const previewSpinner = previewActivity.querySelector('.ui-spinner');
    const previewState = previewActivity.querySelector('.mermaid-editor-preview-state');
    const sessionOptions = options.session || {};
    previewSession = createMermaidPreviewSession({
        parse,
        render,
        setTimer: sessionOptions.setTimer || setTimeout,
        clearTimer: sessionOptions.clearTimer || clearTimeout,
        now: sessionOptions.now || (() => performance.now()),
        validationDelay: sessionOptions.validationDelay ?? 400,
        onDiagnostics(diagnostics) {
            if (editorView?.isDestroyed) return;
            editorView.dispatch(setDiagnostics(editorView.state, diagnostics));
            diagnosticStatus.textContent = diagnostics[0]?.message || '';
            diagnosticStatus.classList.toggle('is-error', diagnostics.length > 0);
        },
        onPreview(svg) {
            previewNavigation.setSVG(svg);
            preview.classList.remove('is-stale');
            hasPreview = true;
        },
        onStatus(status) {
            hasErrors = Boolean(status.hasError);
            previewSpinner.hidden = status.phase !== 'rendering' && status.phase !== 'checking';
            previewState.textContent = status.phase === 'checking' ? 'Checking…'
                : status.phase === 'rendering' ? 'Rendering…'
                    : status.phase === 'error' ? 'Source has errors'
                        : status.phase === 'ready' ? 'Up to date'
                            : 'Valid';
            staleNotice.hidden = !(status.hasError && hasPreview);
            preview.classList.toggle('is-stale', status.hasError && hasPreview);
            if (status.hasError && !hasPreview) previewEmpty.textContent = 'Fix the source error to create a preview.';
            applyNote.textContent = status.hasError ? 'Source has errors; Apply will keep the Markdown source.' : '';
            if (status.diagramType && !templateSelectionTouched) {
                const detectedType = mermaidCatalogueType(catalog, status.diagramType);
                if (detectedType && detectedType.id !== selectedType?.id) selectType(detectedType);
            }
        },
    });

    loadTemplateButton.addEventListener('click', applySelectedTemplate);
    cancelButton.addEventListener('click', () => finish(false));
    applyButton.addEventListener('click', () => finish(true));
    lifecycle = activateModal(overlay, {
        initialFocus: () => editorView.contentDOM,
        dismissOnBackdrop: false,
        onDismiss: () => finish(false),
        shouldDismissOnEscape: event => !options.inputProfile?.capturesEscape?.(editorView, event),
    });
    detachInputProfile = options.inputProfile?.attach?.(editorView, {
        apply: () => finish(true),
        cancel: () => finish(false),
    }) || null;
    previewSession.schedule(editorView.state.doc.toString());

    return {
        overlay,
        editorView,
        close: () => finish(false),
        apply: () => finish(true),
        get hasErrors() { return hasErrors; },
    };
}

export default openMermaidEditor;
