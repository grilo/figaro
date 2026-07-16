/**
 * Document Properties UI for leading YAML frontmatter.
 *
 * The collapsed card keeps metadata out of the reading flow. Its expanded
 * panel offers friendly PDF-layout controls while "Edit YAML" always exposes
 * the original portable source for arbitrary properties.
 */

import {
    frontmatterTemplateChange,
    frontmatterPropertyChange,
    getFrontmatterValue,
    hasLeadingFrontmatter,
    parseFrontmatter,
} from './frontmatter.js';
import { confirmDialog, errorDialog, promptDialog } from './dialogs.js';
import { wrapBlockWidget } from './blockWidget.js';

const PDF_PROPERTY_KEYS = new Set(['cover-page', 'toc-depth', 'print-stylesheet']);
const COVER_PROPERTY_KEYS = new Set(['title', 'subtitle', 'description', 'author', 'date', 'created']);
let frontmatterMenuID = 0;

function selectionTouchesFrontmatter(frontmatter, selection) {
    if (!frontmatter || !selection) return false;
    return selection.ranges.some(range => range.from <= frontmatter.to && range.to >= frontmatter.from);
}

function displayValue(value) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    return normalized.length > 44 ? normalized.slice(0, 41) + '…' : normalized;
}

function isEnabled(value) {
    return /^(?:true|yes|on|1)$/i.test(String(value || '').trim());
}

function tocDepth(value) {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(6, parsed)) : 0;
}

function firstPropertyValue(source, ...keys) {
    return keys.map(key => getFrontmatterValue(source, key)).find(Boolean) || '';
}

function lineEndingFor(source) {
    return String(source || '').includes('\r\n') ? '\r\n' : '\n';
}

function stopEditorMouseSelection(event) {
    // editor.js tracks every mousedown as a selection drag. A block widget
    // would otherwise be removed before its click event has a chance to run.
    event.stopPropagation();
}

function makeButton(className, label, title, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    if (title) {
        button.title = title;
        button.setAttribute('aria-label', title);
    }
    button.addEventListener('mousedown', stopEditorMouseSelection);
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
    });
    return button;
}

function createFieldRow(labelText, control) {
    const row = document.createElement('div');
    row.className = 'cm-frontmatter-panel-row';
    const label = document.createElement('span');
    label.className = 'cm-frontmatter-panel-row-label';
    label.textContent = labelText;
    const interactive = control.matches?.('input, select, button')
        ? control
        : control.querySelector?.('input, select, button');
    if (interactive && !interactive.getAttribute('aria-label')) {
        interactive.setAttribute('aria-label', labelText);
    }
    row.append(label, control);
    return row;
}

function createTextInput(value, placeholder, onCommit) {
    const input = document.createElement('input');
    input.className = 'cm-frontmatter-panel-input';
    input.type = 'text';
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener('change', () => onCommit(input.value));
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            onCommit(input.value);
        }
    });
    return input;
}

function createMenuOption(option, selected, onSelect) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'cm-frontmatter-combobox-option';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(selected));
    item.dataset.value = option.value;
    item.textContent = option.label;
    item.addEventListener('mousedown', event => {
        event.preventDefault();
        stopEditorMouseSelection(event);
    });
    item.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onSelect(option.value);
    });
    return item;
}

function createThemedSelect(value, options, ariaLabel, onSelect) {
    const root = document.createElement('span');
    root.className = 'cm-frontmatter-combobox';
    root.addEventListener('mousedown', stopEditorMouseSelection);

    const menuID = 'figaro-frontmatter-menu-' + ++frontmatterMenuID;
    const selected = options.find(option => option.value === String(value)) || options[0];
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cm-frontmatter-panel-select cm-frontmatter-combobox-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-label', ariaLabel);
    trigger.setAttribute('aria-controls', menuID);
    trigger.setAttribute('aria-expanded', 'false');

    const triggerValue = document.createElement('span');
    triggerValue.className = 'cm-frontmatter-combobox-value';
    triggerValue.textContent = selected.label;
    const triggerArrow = document.createElement('span');
    triggerArrow.className = 'cm-frontmatter-combobox-arrow';
    triggerArrow.textContent = '⌄';
    trigger.append(triggerValue, triggerArrow);

    const menu = document.createElement('span');
    menu.id = menuID;
    menu.className = 'cm-frontmatter-combobox-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', ariaLabel);
    menu.hidden = true;

    let open = false;
    const setOpen = nextOpen => {
        open = nextOpen;
        root.classList.toggle('is-open', open);
        trigger.setAttribute('aria-expanded', String(open));
        menu.hidden = !open;
    };
    const selectOption = nextValue => {
        setOpen(false);
        onSelect(nextValue);
    };

    for (const option of options) {
        menu.appendChild(createMenuOption(option, option.value === selected.value, selectOption));
    }

    trigger.addEventListener('mousedown', stopEditorMouseSelection);
    trigger.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        setOpen(!open);
    });
    trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
        }
    });
    root.addEventListener('focusout', () => {
        requestAnimationFrame(() => {
            if (!root.contains(document.activeElement)) setOpen(false);
        });
    });

    root.append(trigger, menu);
    return root;
}

function createStylesheetCombobox(value, stylesheets, onCommit) {
    const root = document.createElement('span');
    root.className = 'cm-frontmatter-file-combobox';
    root.addEventListener('mousedown', stopEditorMouseSelection);

    const menuID = 'figaro-frontmatter-menu-' + ++frontmatterMenuID;
    const input = document.createElement('input');
    input.className = 'cm-frontmatter-panel-input';
    input.type = 'text';
    input.value = value;
    input.placeholder = 'Built-in style (or _print.css)';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-label', 'Print stylesheet');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', menuID);
    input.setAttribute('aria-expanded', 'false');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'cm-frontmatter-combobox-toggle';
    toggle.textContent = '⌄';
    toggle.title = 'Show vault CSS files';
    toggle.setAttribute('aria-label', 'Show vault CSS files');

    const menu = document.createElement('span');
    menu.id = menuID;
    menu.className = 'cm-frontmatter-combobox-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', 'Vault CSS files');
    menu.hidden = true;

    let open = false;
    const setOpen = nextOpen => {
        open = nextOpen && stylesheets.length > 0;
        root.classList.toggle('is-open', open);
        input.setAttribute('aria-expanded', String(open));
        menu.hidden = !open;
    };
    const selectPath = path => {
        input.value = path;
        setOpen(false);
        onCommit(path);
    };
    const renderOptions = (filterValue = input.value) => {
        const query = String(filterValue || '').trim().toLowerCase();
        const matching = stylesheets.filter(path => path.toLowerCase().includes(query));
        menu.replaceChildren();
        if (!matching.length) {
            const empty = document.createElement('span');
            empty.className = 'cm-frontmatter-combobox-empty';
            empty.textContent = 'No matching CSS files';
            menu.appendChild(empty);
            return;
        }
        for (const path of matching) {
            menu.appendChild(createMenuOption(
                { value: path, label: path },
                path === input.value,
                selectPath
            ));
        }
    };

    renderOptions();
    toggle.disabled = stylesheets.length === 0;
    input.addEventListener('focus', () => {
        renderOptions('');
        setOpen(true);
    });
    input.addEventListener('input', () => {
        renderOptions();
        setOpen(true);
    });
    input.addEventListener('change', () => {
        setOpen(false);
        onCommit(input.value);
    });
    input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            renderOptions();
            setOpen(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            setOpen(false);
            onCommit(input.value);
        }
    });
    toggle.addEventListener('mousedown', event => {
        event.preventDefault();
        stopEditorMouseSelection(event);
    });
    toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        renderOptions('');
        setOpen(!open);
    });
    root.addEventListener('focusout', () => {
        requestAnimationFrame(() => {
            if (!root.contains(document.activeElement)) setOpen(false);
        });
    });

    root.append(input, toggle, menu);
    return root;
}

export function createFrontmatterField(
    StateField,
    StateEffect,
    EditorView,
    Decoration,
    WidgetType,
    _mouseSelectingField,
    getPrintStylesheets = () => [],
    getDefaultAuthor = () => '',
    options = {},
) {
    const setMode = StateEffect.define();
    const {
        getActiveFilePath = () => '',
        promptForStylesheet = suggestedPath => promptDialog(
            'Create PDF stylesheet',
            'Create an editable starter stylesheet relative to this note.',
            suggestedPath,
            {
                icon: 'file-add',
                label: 'Stylesheet path',
                confirmLabel: 'Create stylesheet',
                help: 'Use a vault-relative .css path. Existing files are never overwritten.',
            }
        ),
        confirmUseExistingStylesheet = stylesheetPath => confirmDialog(
            'Use existing PDF stylesheet?',
            `"${stylesheetPath}" already exists and will not be changed. Use it for this note?`,
            false,
            false,
            { confirmLabel: 'Use stylesheet' }
        ),
        createStarterStylesheet = async (notePath, stylesheetPath) => {
            const create = globalThis.pywebview?.api?.create_starter_print_stylesheet;
            if (typeof create !== 'function') {
                return { success: false, error: 'Creating a starter PDF stylesheet is unavailable because the backend is not connected.' };
            }
            return create(notePath, stylesheetPath);
        },
        onStylesheetReady = async () => {},
        onPreviewPDF = async ({ path, title, content }) => {
            const { openPDFPreview } = await import('./pdfPreview.js');
            return openPDFPreview({ path, title, content });
        },
        reportStylesheetError = message => errorDialog('Couldn’t create PDF stylesheet', message, 'The PDF stylesheet could not be created.'),
    } = options || {};

    const changeProperty = (view, key, value) => {
        const change = frontmatterPropertyChange(view.state.doc.toString(), key, value);
        if (!change) return;
        view.dispatch({ changes: change, effects: setMode.of('panel') });
    };

    const showSource = (view, frontmatter, selection = frontmatter.contentFrom) => {
        if (view.isDestroyed) return;
        view.dispatch({
            effects: setMode.of('source'),
            selection: { anchor: selection },
            scrollIntoView: true,
        });
        view.focus();
    };

    class CollapsedPropertiesWidget extends WidgetType {
        constructor(frontmatter) {
            super();
            this.frontmatter = frontmatter;
            this.signature = `${frontmatter.from}:${frontmatter.to}:${frontmatter.entries.map(entry => `${entry.key}:${entry.value}`).join('|')}`;
        }

        eq(other) {
            return other instanceof CollapsedPropertiesWidget && other.signature === this.signature;
        }

        toDOM(view) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'cm-frontmatter';
            button.setAttribute('aria-label', 'Open document properties');
            button.title = 'Open document properties';
            button.addEventListener('mousedown', stopEditorMouseSelection);

            const disclosure = document.createElement('span');
            disclosure.className = 'cm-frontmatter-disclosure';
            disclosure.textContent = '›';

            const label = document.createElement('span');
            label.className = 'cm-frontmatter-label';
            label.textContent = 'Properties';

            const count = document.createElement('span');
            count.className = 'cm-frontmatter-count';
            count.textContent = `${this.frontmatter.entries.length} ${this.frontmatter.entries.length === 1 ? 'property' : 'properties'}`;

            const chips = document.createElement('span');
            chips.className = 'cm-frontmatter-chips';
            const previewEntries = this.frontmatter.entries.slice(0, 3);
            for (const entry of previewEntries) {
                const chip = document.createElement('span');
                chip.className = 'cm-frontmatter-chip';
                const key = document.createElement('span');
                key.className = 'cm-frontmatter-chip-key';
                key.textContent = entry.key;
                chip.appendChild(key);
                if (entry.value) {
                    const value = document.createElement('span');
                    value.className = 'cm-frontmatter-chip-value';
                    value.textContent = displayValue(entry.value);
                    chip.appendChild(value);
                }
                chips.appendChild(chip);
            }
            if (this.frontmatter.entries.length > previewEntries.length) {
                const more = document.createElement('span');
                more.className = 'cm-frontmatter-more';
                more.textContent = `+${this.frontmatter.entries.length - previewEntries.length}`;
                chips.appendChild(more);
            }

            button.append(disclosure, label);
            if (this.frontmatter.entries.length) button.append(count, chips);
            button.addEventListener('click', () => {
                if (!view.isDestroyed) view.dispatch({ effects: setMode.of('panel') });
                view.focus();
            });
            return wrapBlockWidget(button, 'cm-block-widget--frontmatter');
        }

        ignoreEvent() { return true; }
    }

    class AddPropertiesWidget extends WidgetType {
        eq(other) { return other instanceof AddPropertiesWidget; }

        toDOM(view) {
            let creating = false;
            const button = makeButton(
                'cm-add-properties',
                '+ Add properties',
                'Add document properties',
                async () => {
                    if (creating || view.isDestroyed) return;
                    creating = true;
                    button.disabled = true;
                    button.setAttribute('aria-busy', 'true');
                    try {
                        let author = '';
                        try {
                            author = await Promise.resolve(getDefaultAuthor());
                        } catch (_) {
                            // The template is still useful if the host cannot
                            // provide an OS username.
                        }
                        if (view.isDestroyed || hasLeadingFrontmatter(view.state.doc.toString())) return;

                        const change = frontmatterTemplateChange(view.state.doc.toString(), { author });
                        const subtitlePosition = change.from +
                            change.insert.indexOf('subtitle: "') +
                            'subtitle: "'.length;
                        view.dispatch({
                            changes: change,
                            effects: setMode.of('source'),
                            selection: { anchor: subtitlePosition },
                            scrollIntoView: true,
                        });
                        view.focus();
                    } finally {
                        creating = false;
                        button.disabled = false;
                        button.removeAttribute('aria-busy');
                    }
                }
            );
            return wrapBlockWidget(button, 'cm-block-widget--add-properties');
        }

        ignoreEvent() { return true; }
    }

    class PropertiesPanelWidget extends WidgetType {
        constructor(frontmatter, isOpening = false) {
            super();
            this.frontmatter = frontmatter;
            this.isOpening = isOpening;
            this.signature = `${frontmatter.from}:${frontmatter.to}:${frontmatter.entries.map(entry => `${entry.key}:${entry.value}`).join('|')}`;
        }

        eq(other) {
            return other instanceof PropertiesPanelWidget &&
                other.signature === this.signature &&
                other.isOpening === this.isOpening;
        }

        toDOM(view) {
            const source = view.state.doc.toString();
            const panel = document.createElement('section');
            panel.className = 'cm-frontmatter-panel';
            if (this.isOpening) panel.classList.add('cm-frontmatter-panel--enter');
            panel.setAttribute('aria-label', 'Document properties');
            panel.addEventListener('mousedown', stopEditorMouseSelection);

            const header = document.createElement('header');
            header.className = 'cm-frontmatter-panel-header';
            const heading = document.createElement('span');
            heading.className = 'cm-frontmatter-panel-title';
            heading.textContent = 'Properties';
            const actions = document.createElement('span');
            actions.className = 'cm-frontmatter-panel-actions';
            actions.append(
                makeButton('cm-frontmatter-panel-action', 'Edit YAML', 'Edit raw frontmatter', () => showSource(view, this.frontmatter)),
                makeButton('cm-frontmatter-panel-close', '×', 'Collapse properties', () => view.dispatch({ effects: setMode.of('collapsed') }))
            );
            header.append(heading, actions);
            panel.appendChild(header);

            const pdfSection = document.createElement('section');
            pdfSection.className = 'cm-frontmatter-panel-section';
            const pdfTitle = document.createElement('h3');
            pdfTitle.textContent = 'PDF layout';
            pdfSection.appendChild(pdfTitle);

            const coverInput = document.createElement('input');
            coverInput.type = 'checkbox';
            coverInput.className = 'cm-frontmatter-panel-toggle';
            coverInput.checked = isEnabled(getFrontmatterValue(source, 'cover-page'));
            coverInput.addEventListener('change', () => changeProperty(view, 'cover-page', coverInput.checked ? 'true' : 'false'));
            pdfSection.appendChild(createFieldRow('Cover page', coverInput));

            const currentDepth = tocDepth(getFrontmatterValue(source, 'toc-depth'));
            const tocOptions = [];
            for (let depth = 0; depth <= 6; depth++) {
                tocOptions.push({
                    value: String(depth),
                    label: depth === 0 ? 'None' : (depth === 1 ? 'H1' : 'H1–H' + depth),
                });
            }
            pdfSection.appendChild(createFieldRow(
                'Table of Contents',
                createThemedSelect(
                    String(currentDepth),
                    tocOptions,
                    'Table of contents depth',
                    value => changeProperty(view, 'toc-depth', value)
                )
            ));

            const stylesheets = [...new Set((getPrintStylesheets() || []).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b));
            const stylesheetInput = createStylesheetCombobox(
                getFrontmatterValue(source, 'print-stylesheet'),
                stylesheets,
                value => changeProperty(view, 'print-stylesheet', value)
            );
            const stylesheetControl = document.createElement('div');
            stylesheetControl.className = 'cm-frontmatter-stylesheet-control';
            stylesheetControl.appendChild(stylesheetInput);

            let creatingStylesheet = false;
            const createStarter = makeButton(
                'cm-frontmatter-panel-action cm-frontmatter-create-stylesheet',
                'Create starter',
                'Create an editable starter PDF stylesheet',
                async () => {
                    if (creatingStylesheet || view.isDestroyed) return;

                    const suggestedPath = getFrontmatterValue(view.state.doc.toString(), 'print-stylesheet') || 'pdf.css';
                    const stylesheetPath = await promptForStylesheet(suggestedPath);
                    const normalizedPath = String(stylesheetPath || '').trim();
                    if (!normalizedPath || view.isDestroyed) return;

                    const notePath = String(getActiveFilePath() || '').trim();
                    if (!notePath) {
                        reportStylesheetError('Open a Markdown note before creating a PDF stylesheet.');
                        return;
                    }

                    creatingStylesheet = true;
                    createStarter.disabled = true;
                    createStarter.setAttribute('aria-busy', 'true');
                    try {
                        const result = await createStarterStylesheet(notePath, normalizedPath);
                        if (!result?.success) {
                            reportStylesheetError(result?.error || 'Could not create the starter PDF stylesheet.');
                            return;
                        }
                        if (!result.created && !await confirmUseExistingStylesheet(normalizedPath)) return;

                        changeProperty(view, 'print-stylesheet', normalizedPath);
                        await onStylesheetReady(result.path || normalizedPath);
                    } catch (error) {
                        reportStylesheetError(error?.message || 'Could not create the starter PDF stylesheet.');
                    } finally {
                        creatingStylesheet = false;
                        createStarter.disabled = false;
                        createStarter.removeAttribute('aria-busy');
                    }
                }
            );
            stylesheetControl.appendChild(createStarter);
            pdfSection.appendChild(createFieldRow('Print stylesheet', stylesheetControl));
            const stylesheetHint = document.createElement('p');
            stylesheetHint.className = 'cm-frontmatter-panel-hint';
            stylesheetHint.textContent = 'Leave blank for the built-in style or an existing sibling _print.css. Create starter copies an editable example into your vault.';
            pdfSection.appendChild(stylesheetHint);
            const previewPDF = makeButton(
                'cm-frontmatter-panel-action cm-frontmatter-preview-pdf',
                'Preview PDF',
                'Open a live PDF preview',
                async () => {
                    const notePath = String(getActiveFilePath() || '').trim();
                    if (!notePath) {
                        reportStylesheetError('Open a Markdown note before previewing its PDF.');
                        return;
                    }
                    const currentSource = view.state.doc.toString();
                    const noteTitle = getFrontmatterValue(currentSource, 'title') || notePath.split('/').pop().replace(/\.md$/i, '');
                    try {
                        await onPreviewPDF({ path: notePath, title: noteTitle, content: currentSource });
                    } catch (error) {
                        reportStylesheetError(error?.message || 'Could not open the PDF preview.');
                    }
                }
            );
            pdfSection.appendChild(previewPDF);
            panel.appendChild(pdfSection);

            if (coverInput.checked) {
                const coverSection = document.createElement('section');
                coverSection.className = 'cm-frontmatter-panel-section';
                const coverTitle = document.createElement('h3');
                coverTitle.textContent = 'Cover details';
                coverSection.appendChild(coverTitle);
                for (const [key, label, placeholder] of [
                    ['title', 'Title', 'Note title'],
                    ['subtitle', 'Subtitle', 'Optional subtitle'],
                    ['author', 'Author', 'Optional author'],
                    ['date', 'Date', 'YYYY-MM-DD'],
                ]) {
                    coverSection.appendChild(createFieldRow(
                        label,
                        createTextInput(
                            key === 'subtitle'
                                ? firstPropertyValue(source, 'subtitle', 'description')
                                : (key === 'date'
                                    ? firstPropertyValue(source, 'date', 'created')
                                    : getFrontmatterValue(source, key)),
                            placeholder,
                            value => changeProperty(view, key, value)
                        )
                    ));
                }
                panel.appendChild(coverSection);
            }

            const genericEntries = this.frontmatter.entries.filter(entry =>
                !PDF_PROPERTY_KEYS.has(entry.key) &&
                (!coverInput.checked || !COVER_PROPERTY_KEYS.has(entry.key))
            );
            const otherSection = document.createElement('section');
            otherSection.className = 'cm-frontmatter-panel-section cm-frontmatter-other-properties';
            const otherTitle = document.createElement('h3');
            otherTitle.textContent = 'Other properties';
            const chips = document.createElement('div');
            chips.className = 'cm-frontmatter-panel-chips';
            if (genericEntries.length) {
                for (const entry of genericEntries) {
                    const chip = document.createElement('span');
                    chip.className = 'cm-frontmatter-chip';
                    chip.textContent = entry.value ? `${entry.key}: ${displayValue(entry.value)}` : entry.key;
                    chips.appendChild(chip);
                }
            } else {
                const empty = document.createElement('span');
                empty.className = 'cm-frontmatter-panel-empty';
                empty.textContent = 'Add tags, aliases, status, or any custom YAML property.';
                chips.appendChild(empty);
            }
            const addProperty = makeButton('cm-frontmatter-panel-add', '+ Add property', 'Add a property in YAML', () => {
                showSource(view, this.frontmatter, this.frontmatter.contentTo);
                requestAnimationFrame(() => {
                    if (view.isDestroyed) return;
                    const currentFrontmatter = parseFrontmatter(view.state.doc.toString());
                    if (!currentFrontmatter) return;
                    if (!selectionTouchesFrontmatter(currentFrontmatter, view.state.selection)) return;
                    const position = currentFrontmatter.contentTo;
                    const newline = lineEndingFor(view.state.doc.toString());
                    view.dispatch({
                        changes: { from: position, to: position, insert: newline },
                        selection: { anchor: position },
                        effects: setMode.of('source'),
                    });
                    import('@codemirror/autocomplete')
                        .then(({ startCompletion }) => startCompletion(view))
                        .catch(() => {});
                });
            });
            otherSection.append(otherTitle, chips, addProperty);
            panel.appendChild(otherSection);
            return wrapBlockWidget(panel, 'cm-block-widget--frontmatter-panel');
        }

        ignoreEvent() { return true; }
    }

    const sourceDecorations = (state, frontmatter) => {
        const openingLine = state.doc.lineAt(frontmatter.from).from;
        const closingLine = state.doc.lineAt(Math.max(frontmatter.from, frontmatter.to - 1)).from;
        const ranges = [
            Decoration.line({ class: 'cm-frontmatter-source-line' }).range(openingLine),
        ];
        if (closingLine !== openingLine) {
            ranges.push(Decoration.line({ class: 'cm-frontmatter-source-line' }).range(closingLine));
        }
        return Decoration.set(ranges, true);
    };

    const buildDecorations = (state, mode, frontmatter = parseFrontmatter(state.doc.toString()), isOpening = false) => {
        if (!frontmatter && !hasLeadingFrontmatter(state.doc.toString())) {
            return Decoration.set([
                Decoration.widget({ widget: new AddPropertiesWidget(), block: true, side: -1 }).range(0),
            ]);
        }
        if (!frontmatter) return Decoration.none;
        if (mode === 'source') return sourceDecorations(state, frontmatter);
        const widget = mode === 'panel'
            ? new PropertiesPanelWidget(frontmatter, isOpening)
            : new CollapsedPropertiesWidget(frontmatter);
        return Decoration.set([
            Decoration.replace({ widget, block: true }).range(frontmatter.from, frontmatter.to),
        ]);
    };

    return StateField.define({
        create(state) {
            const frontmatter = parseFrontmatter(state.doc.toString());
            const mode = frontmatter ? 'collapsed' : 'none';
            return { mode, frontmatter, decorations: buildDecorations(state, mode, frontmatter) };
        },
        update(value, transaction) {
            let mode = value.mode;
            let explicitMode = false;
            for (const effect of transaction.effects) {
                if (effect.is(setMode)) {
                    mode = effect.value;
                    explicitMode = true;
                }
            }

            const frontmatter = parseFrontmatter(transaction.state.doc.toString());
            if (!frontmatter) mode = 'none';
            else if (!value.frontmatter && !explicitMode) mode = 'collapsed';

            if (transaction.selection && !transaction.docChanged && !explicitMode && mode === 'source') {
                if (!selectionTouchesFrontmatter(frontmatter, transaction.state.selection)) mode = 'collapsed';
            }

            const isOpening = mode === 'panel' && value.mode !== 'panel';

            return {
                mode,
                frontmatter,
                decorations: buildDecorations(transaction.state, mode, frontmatter, isOpening),
            };
        },
        provide: field => EditorView.decorations.from(field, value => value.decorations),
    });
}
