import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { bracketMatching, indentUnit } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { lintKeymap, setDiagnostics } from '@codemirror/lint';

import { activateModal, createDialogShell, createPendingChangesNotice } from './dialogs.js';
import { makeEditorModalResizable } from './editorModalResize.js';
import { inspectMermaidSource, renderDiagramSVG } from './diagramRenderer.js';
import { scanDiagramFences } from './liveDiagramPlugin.js';
import {
    initialMermaidTemplateState,
    mermaidBlockReplacement,
    mermaidCatalogueType,
    mermaidTemplateCatalog,
} from './core/mermaidEditorModel.js';
import { enhanceSelectCombobox } from './selectCombobox.js';
import { openColorPalettePicker } from './colorPalettePicker.js';
import { createMermaidPreviewNavigation } from './mermaidPreviewNavigation.js';
import { createMermaidPreviewSession } from './usecases/mermaidPreviewSession.js';
import { diagramData } from '../vendored/mermaid-examples/index.js';
import { normalizeTabSize, tabSizeIndentUnit } from './core/tabSizeModel.js';
import {
    mermaidFlowchartDirection,
    mermaidFlowchartNodes,
    mermaidSourceWithFlowchartDirection,
    mermaidSourceWithFlowchartNodeStyle,
    mermaidSourceWithStyleConfig,
    mermaidStyleConfigState,
    mermaidStyleDescriptor,
    mermaidTargetColor,
    mermaidTargetVariablePatch,
    mermaidThemePresetForState,
    mermaidThemePresetPatch,
    mermaidUsesApplicationTheme,
} from './core/mermaidStyleEditorModel.js';

export const mermaidTemplates = mermaidTemplateCatalog(diagramData);

function replaceEditorDocument(view, source) {
    view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: source },
        selection: { anchor: 0 },
    });
    view.focus();
}

function applicationAccentColor() {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
    return /^#[\da-f]{6}$/iu.test(value) ? value : '#ef4444';
}

function createChoiceControl(label, choices, selected, onSelect, className = '') {
    const wrapper = document.createElement('div');
    wrapper.className = `mermaid-editor-style-control${className ? ` ${className}` : ''}`;
    const controlLabel = document.createElement('span');
    controlLabel.className = 'mermaid-editor-style-label';
    controlLabel.textContent = label;
    const control = document.createElement('div');
    control.className = 'ui-segmented-control ui-segmented-control--quiet';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', label);
    for (const choice of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ui-button';
        button.textContent = choice.label;
        button.dataset.value = choice.value;
        button.dataset.styleFocus = `${label}:${choice.value}`;
        button.setAttribute('aria-pressed', String(choice.value === selected));
        button.addEventListener('click', () => onSelect(choice.value, button));
        control.append(button);
    }
    wrapper.append(controlLabel, control);
    return wrapper;
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
    const tabSize = normalizeTabSize(mainView.state.tabSize);
    const catalog = options.catalog || mermaidTemplates;
    const parse = options.parse || inspectMermaidSource;
    const render = options.render || (source => renderDiagramSVG('mermaid', source, 'figaro-mermaid-editor', {
        appearance: 'application',
    }));
    const { overlay } = createDialogShell({
        title: 'Mermaid Editor',
        description: 'Edit the source directly or use styling controls tailored to the detected diagram type.',
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
    const modalResize = makeEditorModalResizable(overlay.querySelector('.custom-modal'));

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
    sourcePane.setAttribute('aria-label', 'Mermaid source and style controls');
    const sourceHeading = document.createElement('div');
    sourceHeading.className = 'mermaid-editor-mode-heading';
    const modeControl = document.createElement('div');
    modeControl.className = 'ui-segmented-control ui-segmented-control--quiet mermaid-editor-mode-control';
    modeControl.setAttribute('role', 'tablist');
    modeControl.setAttribute('aria-label', 'Mermaid editor mode');
    const sourceModeButton = document.createElement('button');
    sourceModeButton.type = 'button';
    sourceModeButton.className = 'ui-button';
    sourceModeButton.textContent = 'Source';
    sourceModeButton.id = 'mermaid-editor-source-tab';
    sourceModeButton.setAttribute('role', 'tab');
    sourceModeButton.setAttribute('aria-selected', 'true');
    sourceModeButton.setAttribute('aria-pressed', 'true');
    sourceModeButton.setAttribute('aria-controls', 'mermaid-editor-source-panel');
    sourceModeButton.tabIndex = 0;
    const styleModeButton = document.createElement('button');
    styleModeButton.type = 'button';
    styleModeButton.className = 'ui-button';
    styleModeButton.textContent = 'Style';
    styleModeButton.id = 'mermaid-editor-style-tab';
    styleModeButton.setAttribute('role', 'tab');
    styleModeButton.setAttribute('aria-selected', 'false');
    styleModeButton.setAttribute('aria-pressed', 'false');
    styleModeButton.setAttribute('aria-controls', 'mermaid-editor-style-panel');
    styleModeButton.tabIndex = -1;
    modeControl.append(sourceModeButton, styleModeButton);
    sourceHeading.append(modeControl);
    const sourceContent = document.createElement('div');
    sourceContent.className = 'mermaid-editor-source-content';
    sourceContent.id = 'mermaid-editor-source-panel';
    sourceContent.setAttribute('role', 'tabpanel');
    sourceContent.setAttribute('aria-label', 'Mermaid source');
    sourceContent.setAttribute('aria-labelledby', sourceModeButton.id);
    const codeHost = document.createElement('div');
    codeHost.className = 'mermaid-editor-code-host';
    sourceContent.append(codeHost);
    const styleContent = document.createElement('div');
    styleContent.className = 'mermaid-editor-style-content';
    styleContent.id = 'mermaid-editor-style-panel';
    styleContent.setAttribute('role', 'tabpanel');
    styleContent.setAttribute('aria-label', 'Mermaid styling');
    styleContent.setAttribute('aria-labelledby', styleModeButton.id);
    styleContent.hidden = true;
    const diagnosticStatus = document.createElement('p');
    diagnosticStatus.className = 'mermaid-editor-diagnostic-status';
    diagnosticStatus.setAttribute('role', 'status');
    diagnosticStatus.setAttribute('aria-live', 'polite');
    sourcePane.append(sourceHeading, sourceContent, styleContent, diagnosticStatus);

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
    preview.classList.toggle('is-application-themed', mermaidUsesApplicationTheme(originalBlock.code));
    preview.setAttribute('aria-live', 'polite');
    const previewEmpty = document.createElement('p');
    previewEmpty.className = 'mermaid-editor-preview-empty';
    previewEmpty.textContent = 'A valid diagram preview will appear here.';
    preview.append(previewEmpty);
    let selectedFlowchartNodeId = '';
    let inspection = null;
    let inspectedSource = '';
    let styleDocumentChange = false;
    let paintedSource = '';
    let paintedError = false;
    let paintedInspection = false;
    let colorPicker = null;
    let colorBindings = [];
    let revealSelectedFlowchartNode = false;
    let refreshStylePanel = () => {};
    const previewNavigation = createMermaidPreviewNavigation(preview, {
        emptyElement: previewEmpty,
        onNodeSelect(nodeId) {
            selectedFlowchartNodeId = nodeId;
            revealSelectedFlowchartNode = true;
            refreshStylePanel();
        },
    });
    const staleNotice = document.createElement('p');
    staleNotice.className = 'ui-notice ui-notice--warning mermaid-editor-stale-notice';
    staleNotice.textContent = 'Preview paused at the last valid version while the source has errors.';
    staleNotice.hidden = true;
    previewPane.append(previewHeading, preview, staleNotice);
    panes.append(sourcePane, previewPane);
    const {
        notice: discard,
        keepButton,
        discardButton,
    } = createPendingChangesNotice('Mermaid');
    discard.classList.add('mermaid-editor-discard');
    workspace.append(templateBar, panes, discard);

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
    let detectedDiagramType = selectedType?.id || 'flowchart-v2';

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
        className: 'ui-picker--quiet mermaid-editor-combobox',
        ariaLabel: 'Diagram',
    });
    enhanceSelectCombobox(templateSelect, {
        className: 'ui-picker--quiet mermaid-editor-combobox',
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
        modalResize.destroy();
        colorPicker?.close();
        previewSession?.destroy();
        previewNavigation.destroy();
        detachInputProfile?.();
        editorView?.destroy();
        lifecycle.close(false);
        mainView.focus();
        return true;
    };

    const dirty = () => editorView.state.doc.toString() !== initialTemplateState.source;
    const hideDiscard = () => {
        discard.hidden = true;
        cancelButton.focus();
    };
    const requestCancel = () => {
        colorPicker?.close();
        colorPicker = null;
        if (!dirty()) return finish(false);
        discard.hidden = false;
        keepButton.focus();
        return false;
    };

    editorView = new EditorView({
        parent: codeHost,
        state: EditorState.create({
            doc: initialTemplateState.source,
            extensions: [
                EditorState.tabSize.of(tabSize),
                indentUnit.of(tabSizeIndentUnit(tabSize)),
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
                    if (!styleDocumentChange) inspection = null;
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

    let styleActionMessage = '';
    const showMode = mode => {
        const styleMode = mode === 'style';
        sourceContent.hidden = styleMode;
        styleContent.hidden = !styleMode;
        sourceModeButton.setAttribute('aria-selected', String(!styleMode));
        sourceModeButton.setAttribute('aria-pressed', String(!styleMode));
        sourceModeButton.tabIndex = styleMode ? -1 : 0;
        styleModeButton.setAttribute('aria-selected', String(styleMode));
        styleModeButton.setAttribute('aria-pressed', String(styleMode));
        styleModeButton.tabIndex = styleMode ? 0 : -1;
        if (styleMode) refreshStylePanel();
        else {
            editorView.requestMeasure();
            editorView.focus();
        }
    };
    sourceModeButton.addEventListener('click', () => showMode('source'));
    styleModeButton.addEventListener('click', () => showMode('style'));
    modeControl.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const styleMode = event.key === 'ArrowRight' || event.key === 'End';
        showMode(styleMode ? 'style' : 'source');
        (styleMode ? styleModeButton : sourceModeButton).focus();
    });

    const applyStyleSource = result => {
        if (result?.reason) {
            styleActionMessage = result.reason;
            refreshStylePanel();
            return false;
        }
        styleActionMessage = '';
        if (!result?.changed) {
            refreshStylePanel();
            return false;
        }
        styleDocumentChange = true;
        inspectedSource = result.source;
        // Native scalar/managed-node edits preserve parsed node identities.
        if (inspection) inspection = { ...inspection, config: undefined };
        editorView.dispatch({
            changes: { from: 0, to: editorView.state.doc.length, insert: result.source },
            userEvent: 'input',
        });
        styleDocumentChange = false;
        refreshStylePanel();
        return true;
    };

    const createColorButton = ({ label, color = '', emptyLabel = 'Automatic color', readColor, onSelect }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ui-icon-button mermaid-editor-color-button';
        button.setAttribute('aria-label', `${label}: ${color || 'automatic'}`);
        button.dataset.uiTooltip = `${label}: ${color || 'Automatic'}`;
        button.dataset.styleFocus = label;
        button.dataset.colorValue = color;
        const swatch = document.createElement('span');
        swatch.className = 'mermaid-editor-color-swatch';
        swatch.setAttribute('aria-hidden', 'true');
        if (color) swatch.style.background = color;
        else swatch.classList.add('is-automatic');
        button.append(swatch);
        button.addEventListener('click', () => {
            colorPicker = openColorPalettePicker(button, {
                currentColor: button.dataset.colorValue,
                emptyLabel,
                label,
                onSelect,
            });
            colorPicker?.picker.querySelector('[aria-selected="true"], button')?.focus({ preventScroll: true });
        });
        if (readColor) colorBindings.push({button, swatch, label, readColor});
        return button;
    };

    const syncStyleColors = () => {
        for (const { button, swatch, label, readColor } of colorBindings) {
            const color = readColor() || '';
            button.dataset.colorValue = color;
            button.setAttribute('aria-label', `${label}: ${color || 'automatic'}`);
            button.dataset.uiTooltip = `${label}: ${color || 'Automatic'}`;
            swatch.style.background = color;
            swatch.classList.toggle('is-automatic', !color);
        }
    };

    const createSection = title => {
        const section = document.createElement('section');
        section.className = 'mermaid-editor-style-section';
        const heading = document.createElement('h4');
        heading.textContent = title;
        section.append(heading);
        return section;
    };

    refreshStylePanel = () => {
        if (!editorView || styleContent.hidden) return;
        const source = editorView.state.doc.toString();
        const descriptor = mermaidStyleDescriptor(detectedDiagramType, inspection);
        const styleState = mermaidStyleConfigState(source, inspection?.config);
        const focusKey = styleContent.contains(document.activeElement) ? document.activeElement.dataset.styleFocus : '';
        const scrollTop = styleContent.scrollTop;
        const nodeListScrollTop = styleContent.querySelector('.mermaid-editor-node-list')?.scrollTop || 0;
        paintedSource = source;
        paintedError = hasErrors;
        paintedInspection = !!inspection;
        colorPicker?.close();
        colorBindings = [];
        styleContent.replaceChildren();

        if (styleActionMessage) {
            const notice = document.createElement('p');
            notice.className = 'ui-notice ui-notice--warning mermaid-editor-style-notice';
            notice.textContent = styleActionMessage;
            styleContent.append(notice);
        }
        if (hasErrors) {
            const notice = document.createElement('p');
            notice.className = 'ui-notice ui-notice--warning mermaid-editor-style-notice';
            notice.textContent = 'Fix the Mermaid source error before changing visual styles.';
            styleContent.append(notice);
            return;
        }
        if (!inspection || inspectedSource !== source) {
            const message = document.createElement('p');
            message.className = 'mermaid-editor-style-empty';
            message.textContent = 'Checking diagram before showing its styling controls…';
            styleContent.append(message);
            return;
        }

        const appearance = createSection('Appearance');
        appearance.append(createChoiceControl('Theme', [
            { value: 'document', label: 'Document' },
            { value: 'neutral', label: 'Neutral' },
            { value: 'accent', label: 'Accent' },
        ], mermaidThemePresetForState(styleState), preset => {
            applyStyleSource(mermaidSourceWithStyleConfig(
                editorView.state.doc.toString(),
                mermaidThemePresetPatch(preset, applicationAccentColor()),
            ));
        }));
        if (mermaidThemePresetForState(styleState) === 'custom') {
            const message = document.createElement('p');
            message.className = 'mermaid-editor-style-empty';
            message.textContent = `Custom source theme${styleState.theme ? ` (${styleState.theme})` : ''}. Choosing a preset replaces its shared theme settings.`;
            appearance.append(message);
        }

        const typeSection = createSection(descriptor.label);
        typeSection.dataset.diagramType = descriptor.id;
        if (descriptor.targets.length) {
            const targets = document.createElement('div');
            targets.className = `mermaid-editor-style-targets${descriptor.kind === 'palette' ? ' is-palette' : ''}`;
            for (const styleTarget of descriptor.targets) {
                const row = document.createElement('div');
                row.className = 'mermaid-editor-style-target';
                const label = document.createElement('span');
                label.textContent = styleTarget.label;
                const readColor = () => mermaidTargetColor(styleTarget,
                    mermaidStyleConfigState(editorView.state.doc.toString(), inspection?.config), inspection?.effectiveVariables);
                row.append(label, createColorButton({
                    label: /color$/iu.test(styleTarget.label) ? styleTarget.label : `${styleTarget.label} color`,
                    color: readColor(),
                    readColor,
                    emptyLabel: Number.isInteger(styleTarget.paletteIndex) ? 'Reset plot palette' : 'Automatic color',
                    onSelect(color) {
                        applyStyleSource(mermaidSourceWithStyleConfig(editorView.state.doc.toString(), {
                            variables: mermaidTargetVariablePatch(styleTarget, color, mermaidStyleConfigState(editorView.state.doc.toString()), inspection.effectiveVariables),
                        }));
                    },
                }));
                targets.append(row);
            }
            typeSection.append(targets);
        } else {
            const message = document.createElement('p');
            message.className = 'mermaid-editor-style-empty';
            message.textContent = 'No element-color controls are available for this renderer. Use Source for diagram-specific styling; theme support varies by diagram.';
            typeSection.append(message);
        }

        if (descriptor.kind === 'flowchart') {
            const direction = createChoiceControl('Direction', [
                { value: 'TB', label: 'Top–bottom' },
                { value: 'LR', label: 'Left–right' },
                { value: 'BT', label: 'Bottom–top' },
                { value: 'RL', label: 'Right–left' },
            ], mermaidFlowchartDirection(source), value => {
                applyStyleSource(mermaidSourceWithFlowchartDirection(editorView.state.doc.toString(), value));
            }, 'mermaid-editor-direction-control');
            typeSection.insertBefore(direction, typeSection.children[1]);
            typeSection.append(createChoiceControl('Connection curve', [
                { value: 'linear', label: 'Straight' },
                { value: 'basis', label: 'Smooth' },
                { value: 'stepAfter', label: 'Stepped' },
            ], styleState.flowchartCurve || 'basis', curve => {
                applyStyleSource(mermaidSourceWithStyleConfig(editorView.state.doc.toString(), {
                    flowchartCurve: curve,
                }));
            }));

            const nodes = mermaidFlowchartNodes(source, inspection);
            if (!nodes.some(node => node.id === selectedFlowchartNodeId)) selectedFlowchartNodeId = nodes[0]?.id || '';
            previewNavigation.setSelectableNodeIds(nodes.map(node => node.id));
            previewNavigation.setSelectedNode(selectedFlowchartNodeId);

            const nodeSection = createSection('Individual nodes');
            if (nodes.length) {
                const instruction = document.createElement('p');
                instruction.className = 'mermaid-editor-node-help';
                instruction.textContent = 'Select a node below or in the preview, then edit its fill and shape.';

                const selectedNode = nodes.find(node => node.id === selectedFlowchartNodeId) || nodes[0];
                const selectedControls = document.createElement('div');
                selectedControls.className = 'mermaid-editor-selected-node';
                selectedControls.setAttribute('aria-label', `Editing node ${selectedNode.label}`);
                const selectedHeading = document.createElement('div');
                selectedHeading.className = 'mermaid-editor-selected-node-heading';
                const selectedName = document.createElement('strong');
                selectedName.textContent = `Editing · ${selectedNode.label}`;
                const selectedId = document.createElement('span');
                selectedId.textContent = `Node ${selectedNode.id}`;
                selectedHeading.append(selectedName, selectedId);
                const fillRow = document.createElement('div');
                fillRow.className = 'mermaid-editor-selected-node-color';
                const fillLabel = document.createElement('span');
                fillLabel.textContent = 'Fill color';
                fillRow.append(fillLabel, createColorButton({
                    label: `${selectedNode.label} fill`,
                    color: selectedNode.fill || '',
                    emptyLabel: 'Use source/default color',
                    onSelect(color) {
                        applyStyleSource(mermaidSourceWithFlowchartNodeStyle(
                            editorView.state.doc.toString(),
                            selectedNode.id,
                            { fill: color },
                            inspection,
                        ));
                    },
                }));
                const shapeControl = createChoiceControl('Shape', [
                    { value: 'original', label: 'Original' },
                    { value: 'rounded', label: 'Rounded' },
                    { value: 'stadium', label: 'Pill' },
                ], selectedNode.shape || 'original', shape => {
                    applyStyleSource(mermaidSourceWithFlowchartNodeStyle(
                        editorView.state.doc.toString(),
                        selectedNode.id,
                        { shape },
                        inspection,
                    ));
                }, 'mermaid-editor-selected-node-shape');
                selectedControls.append(selectedHeading, shapeControl, fillRow);

                const nodeList = document.createElement('div');
                nodeList.className = 'mermaid-editor-node-list';
                nodeList.setAttribute('role', 'listbox');
                nodeList.setAttribute('aria-label', 'Choose a flowchart node to edit');
                const selectNode = (node, focus = true) => {
                    selectedFlowchartNodeId = node.id;
                    refreshStylePanel();
                    if (focus) {
                        styleContent.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`)?.focus();
                    }
                };
                nodes.forEach((node, index) => {
                    const row = document.createElement('button');
                    row.type = 'button';
                    row.className = 'ui-menu-item mermaid-editor-node-row';
                    row.dataset.nodeId = node.id;
                    row.dataset.styleFocus = `node:${node.id}`;
                    row.setAttribute('role', 'option');
                    row.setAttribute('aria-selected', String(node.id === selectedFlowchartNodeId));
                    row.tabIndex = node.id === selectedFlowchartNodeId ? 0 : -1;
                    const identity = document.createElement('span');
                    identity.className = 'mermaid-editor-node-identity';
                    const name = document.createElement('span');
                    name.className = 'mermaid-editor-node-name';
                    name.textContent = node.label;
                    const id = document.createElement('span');
                    id.className = 'mermaid-editor-node-id';
                    id.textContent = `Node ${node.id}`;
                    identity.append(name, id);
                    const shape = document.createElement('span');
                    shape.className = 'mermaid-editor-node-shape';
                    shape.textContent = {
                        original: 'Original',
                        rounded: 'Rounded',
                        stadium: 'Pill',
                    }[node.shape] || 'Original';
                    const swatch = document.createElement('span');
                    swatch.className = 'mermaid-editor-node-swatch';
                    swatch.setAttribute('aria-hidden', 'true');
                    if (node.fill) swatch.style.background = node.fill;
                    row.setAttribute('aria-label', `${node.label}, ${shape.textContent} shape, ${node.fill ? `color ${node.fill}` : 'default color'}, node ${node.id}`);
                    row.append(identity, shape, swatch);
                    row.addEventListener('click', () => selectNode(node));
                    row.addEventListener('keydown', event => {
                        const destination = {
                            ArrowDown: Math.min(nodes.length - 1, index + 1),
                            ArrowUp: Math.max(0, index - 1),
                            Home: 0,
                            End: nodes.length - 1,
                        }[event.key];
                        if (destination === undefined) return;
                        event.preventDefault();
                        selectNode(nodes[destination]);
                    });
                    nodeList.append(row);
                });
                nodeSection.append(instruction, selectedControls, nodeList);
            } else {
                const message = document.createElement('p');
                message.className = 'mermaid-editor-style-empty';
                message.textContent = 'Add a named node in Source mode to style it individually.';
                nodeSection.append(message);
            }
            styleContent.append(nodeSection, typeSection, appearance);
        } else {
            previewNavigation.setSelectableNodeIds([]);
            previewNavigation.setSelectedNode('');
            styleContent.append(typeSection, appearance);
        }
        styleContent.scrollTop = scrollTop;
        const refreshedNodeList = styleContent.querySelector('.mermaid-editor-node-list');
        if (refreshedNodeList) refreshedNodeList.scrollTop = nodeListScrollTop;
        if (revealSelectedFlowchartNode) {
            revealSelectedFlowchartNode = false;
            styleContent.querySelector('.mermaid-editor-selected-node')?.scrollIntoView?.({ block: 'nearest' });
        }
        if (focusKey) styleContent.querySelector(`[data-style-focus="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    };

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
            if (mermaidStyleDescriptor(detectedDiagramType).kind === 'flowchart') {
                previewNavigation.setSelectableNodeIds(mermaidFlowchartNodes(editorView.state.doc.toString(), inspection || {}).map(node => node.id));
                previewNavigation.setSelectedNode(selectedFlowchartNodeId);
            }
            preview.classList.remove('is-stale');
            hasPreview = true;
        },
        onStatus(status) {
            hasErrors = Boolean(status.hasError);
            if (status.inspection) {
                inspection = status.inspection;
                inspectedSource = status.source;
            }
            if (status.diagramType) detectedDiagramType = status.diagramType;
            if (status.phase === 'valid' && status.source !== undefined) {
                preview.classList.toggle('is-application-themed', mermaidUsesApplicationTheme(status.source));
            }
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
            if (paintedSource !== editorView.state.doc.toString() || paintedError !== hasErrors
                || paintedInspection !== !!inspection) refreshStylePanel();
            else if (status.phase === 'valid') syncStyleColors();
        },
    });

    loadTemplateButton.addEventListener('click', applySelectedTemplate);
    cancelButton.addEventListener('click', requestCancel);
    applyButton.addEventListener('click', () => finish(true));
    keepButton.addEventListener('click', hideDiscard);
    discardButton.addEventListener('click', () => finish(false));
    lifecycle = activateModal(overlay, {
        initialFocus: () => editorView.contentDOM,
        dismissOnBackdrop: false,
        onDismiss: () => finish(false),
        shouldDismissOnEscape: event => {
            if (colorPicker?.picker.isConnected) {
                event.preventDefault();
                colorPicker.close({ restoreFocus: true });
                colorPicker = null;
                return false;
            }
            event.preventDefault();
            event.stopPropagation();
            if (!discard.hidden) hideDiscard();
            else requestCancel();
            return false;
        },
    });
    detachInputProfile = options.inputProfile?.attach?.(editorView, {
        apply: () => finish(true),
        cancel: requestCancel,
    }) || null;
    previewSession.schedule(editorView.state.doc.toString());

    return {
        overlay,
        editorView,
        close: requestCancel,
        apply: () => finish(true),
        get hasErrors() { return hasErrors; },
    };
}

export default openMermaidEditor;
