/**
 * Live diagram preview for Mermaid, Vega, and Vega-Lite fenced code blocks.
 *
 * Diagram fences are owned exclusively by this extension. The regular
 * codeBlockField is configured to skip these languages in editor.js, which
 * prevents two replacement decorations from competing for the same range.
 *
 * Block-replacement decorations affect editor layout, so CodeMirror requires
 * them to come from a StateField rather than a ViewPlugin.
 */
import { log } from './log.js';
import { diagramLanguages, renderDiagramSVG } from './diagramRenderer.js';
import { wrapBlockWidget } from './blockWidget.js';

export { diagramLanguages };

const DIAGRAM_LANGS = new Set(diagramLanguages);

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

function parseFenceOpener(line) {
    const match = line.match(FENCE_OPEN_RE);
    if (!match) return null;

    const info = match[2].trim();
    return {
        marker: match[1][0],
        length: match[1].length,
        language: info.split(/\s+/, 1)[0].toLowerCase(),
    };
}

function parseFenceCloser(line) {
    const match = line.match(FENCE_CLOSE_RE);
    if (!match) return null;
    return { marker: match[1][0], length: match[1].length };
}

/**
 * Scan fenced blocks directly from the document rather than relying only on
 * the syntax tree. CodeMirror correctly follows CommonMark's requirement
 * that a closing fence be at least as long as its opener. In a live editor,
 * though, a mistaken six-backtick opener followed by a normal three-backtick
 * closer should not make every later diagram disappear.
 *
 * For diagram blocks only, a shorter bare closing fence is recovered as the
 * likely intended closer. The widget labels that recovery, while normal
 * Markdown semantics (including deliberate six-fence nesting in regular
 * code blocks) remain intact.
 */
export function scanDiagramFences(doc) {
    const diagrams = [];
    let open = null;

    const finish = (closeLine, recoveredFence) => {
        if (DIAGRAM_LANGS.has(open.language)) {
            const code = [];
            for (let lineNumber = open.lineNumber + 1; lineNumber < closeLine.number; lineNumber++) {
                code.push(doc.line(lineNumber).text);
            }
            diagrams.push({
                from: open.from,
                to: closeLine.to,
                lang: open.language,
                code: code.join('\n').trim(),
                recoveredFence,
            });
        }
        open = null;
    };

    for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
        const line = doc.line(lineNumber);
        if (!open) {
            const opener = parseFenceOpener(line.text);
            if (!opener) continue;
            open = { ...opener, from: line.from, lineNumber };
            continue;
        }

        const closer = parseFenceCloser(line.text);
        if (!closer || closer.marker !== open.marker) continue;

        if (closer.length >= open.length) {
            finish(line, false);
        } else if (DIAGRAM_LANGS.has(open.language) && closer.length >= 3) {
            // Be forgiving for a likely accidental longer opener. This is
            // intentionally scoped to diagrams so regular code can still use
            // longer fences to contain literal triple-backtick examples.
            finish(line, true);
        }
    }

    return diagrams;
}

function setMessage(container, className, text) {
    const message = document.createElement('div');
    message.className = className;
    message.textContent = text;
    container.replaceChildren(message);
}

function createDiagramWidget(WidgetType) {
    return class DiagramWidget extends WidgetType {
        constructor(lang, code, recoveredFence = false) {
            super();
            this.lang = lang;
            this.code = code;
            this.recoveredFence = recoveredFence;
            this.destroyed = false;
            this.renderVersion = 0;
        }

        eq(other) {
            return other instanceof DiagramWidget &&
                other.lang === this.lang &&
                other.code === this.code &&
                other.recoveredFence === this.recoveredFence;
        }

        toDOM() {
            const dom = document.createElement('div');
            dom.className = 'cm-live-diagram';
            dom.dataset.lang = this.lang;
            if (this.recoveredFence) dom.dataset.recoveredFence = 'true';
            dom.setAttribute('aria-label', this.lang + ' diagram');

            const label = document.createElement('div');
            label.className = 'cm-live-diagram-label';
            label.textContent = this.recoveredFence ? this.lang + ' · recovered fence' : this.lang;
            if (this.recoveredFence) {
                label.title = 'The closing fence has fewer backticks than its opener. Use matching fence lengths to keep the Markdown portable.';
            }

            const content = document.createElement('div');
            content.className = 'cm-live-diagram-view';
            content.setAttribute('aria-live', 'polite');
            setMessage(content, 'cm-live-diagram-loading', 'Rendering ' + this.lang + '…');

            dom.append(label, content);
            this.renderInto(content);
            return wrapBlockWidget(dom, 'cm-block-widget--diagram');
        }

        async renderInto(container) {
            const version = ++this.renderVersion;

            try {
                const svg = await renderDiagramSVG(this.lang, this.code, 'figaro-live-diagram');
                if (this.destroyed || version !== this.renderVersion) return;

                if (typeof svg !== 'string' || !svg) {
                    setMessage(container, 'cm-live-diagram-error', 'Diagram renderer is unavailable');
                    return;
                }

                container.innerHTML = svg;
            } catch (error) {
                if (this.destroyed || version !== this.renderVersion) return;
                log.warn('[diagram] ' + this.lang + ' render error: ' + (error.message || error));
                setMessage(container, 'cm-live-diagram-error', 'Unable to render ' + this.lang + ' diagram');
            }
        }

        // Let a click on the preview move the cursor back into the source.
        ignoreEvent() {
            return false;
        }

        destroy() {
            this.destroyed = true;
            this.renderVersion++;
        }
    };
}

/** Build the live-preview state field for diagram block decorations. */
export function createDiagramField(StateField, EditorView, Decoration, WidgetType, shouldShowSource, mouseSelectingField) {
    const DiagramWidget = createDiagramWidget(WidgetType);

    const buildDecorations = (state) => {
        const decorations = [];
        const isDragging = state.field(mouseSelectingField, false);

        for (const block of scanDiagramFences(state.doc)) {
            if (!block.code || isDragging || shouldShowSource(state, block.from, block.to)) continue;
            decorations.push(Decoration.replace({
                widget: new DiagramWidget(block.lang, block.code, block.recoveredFence),
                block: true,
            }).range(block.from, block.to));
        }

        return decorations.length
            ? Decoration.set(decorations.sort((a, b) => a.from - b.from), true)
            : Decoration.none;
    };

    return StateField.define({
        create: buildDecorations,
        update(decorations, transaction) {
            if (transaction.docChanged || transaction.reconfigured) {
                return buildDecorations(transaction.state);
            }

            const isDragging = transaction.state.field(mouseSelectingField, false);
            const wasDragging = transaction.startState.field(mouseSelectingField, false);
            if (wasDragging && !isDragging) return buildDecorations(transaction.state);
            if (isDragging) return decorations;
            if (transaction.selection) return buildDecorations(transaction.state);
            return decorations;
        },
        provide: field => EditorView.decorations.from(field),
    });
}
