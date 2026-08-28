import { RangeSet, RangeSetBuilder, Transaction } from '@codemirror/state';
import { GutterMarker, ViewPlugin, gutter, keymap } from '@codemirror/view';
import {
    codeFolding,
    ensureSyntaxTree,
    foldEffect,
    foldedRanges,
    foldKeymap,
    syntaxTree,
    unfoldEffect,
} from '@codemirror/language';
import { markdownHeadingFoldingExtension } from './markdownHeadingFolding.js';
import { synchronizeEditorBlockActionLayout } from './editorBlockActionLayout.js';
import {
    leadingFrontmatterEnd,
    MARKDOWN_BLOCK_GUIDE_MAX_LABEL_LENGTH,
    markdownHeadingLevel,
    markdownBlockGuidePlan,
} from './core/markdownBlockGuideModel.js';
import { markdownFoldAnchorPlan } from './core/markdownFoldAnchorModel.js';
import { markdownTableMetadataEnd } from './core/markdownTableEditorModel.js';

const foldAnchorReserveProperty = '--markdown-fold-anchor-reserve';

function codeInfo(node, state) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name === 'CodeInfo') return state.sliceDoc(child.from, child.to);
    }
    const firstLine = state.doc.lineAt(node.from).text;
    return firstLine.replace(/^\s*(?:`{3,}|~{3,})\s*/, '').trim();
}

function topLevelBlocks(state) {
    const blocks = [];
    const source = state.doc.toString();
    const frontmatterEnd = leadingFrontmatterEnd(source);
    const tree = ensureSyntaxTree(state, state.doc.length) || syntaxTree(state);
    for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
        if (node.from < frontmatterEnd) continue;
        const to = node.name === 'Table' ? markdownTableMetadataEnd(source, node.to) : node.to;
        blocks.push({
            name: node.name,
            from: node.from,
            to,
            source: state.sliceDoc(node.from, to),
            info: node.name === 'FencedCode' ? codeInfo(node, state) : '',
        });
    }
    return blocks;
}

/** Build stable, DOM-free guide descriptors from the current Markdown tree. */
export function buildMarkdownBlockGuides(state) {
    const blocks = topLevelBlocks(state);
    const guides = [];
    blocks.forEach((block, index) => {
        const plan = markdownBlockGuidePlan(block);
        if (!plan) return;
        let range = { from: block.from, to: block.to };
        if (plan.rangeStrategy === 'heading-section') {
            const relativeBoundaryIndex = blocks.slice(index + 1).findIndex(candidate => {
                const nextLevel = markdownHeadingLevel(candidate.name);
                return nextLevel && nextLevel <= plan.level;
            });
            const boundaryIndex = relativeBoundaryIndex < 0 ? blocks.length : index + 1 + relativeBoundaryIndex;
            range = {
                from: block.to,
                to: boundaryIndex < blocks.length ? blocks[boundaryIndex - 1].to : state.doc.length,
            };
        } else if (plan.rangeStrategy === 'block-after-first-line') {
            range = { from: state.doc.lineAt(block.from).to, to: block.to };
        } else if (plan.rangeStrategy === 'whole-block') {
            range = { from: block.from, to: block.to };
        }
        const line = state.doc.lineAt(block.from);
        const headingTitle = plan.level
            ? block.source.replace(/^#{1,6}[ \t]+/, '').replace(/[ \t]+#*[ \t]*$/u, '').split(/\r?\n/, 1)[0].trim()
            : '';
        guides.push({
            ...plan,
            from: block.from,
            to: block.to,
            lineFrom: line.from,
            foldFrom: range.from,
            foldTo: range.to,
            title: headingTitle,
            foldable: range.to > range.from,
        });
    });

    // Markdown permits a visually standalone image line inside a larger
    // Paragraph node. Build its guide from the exact Image node rather than
    // requiring blank lines around the authored image.
    const frontmatterEnd = leadingFrontmatterEnd(state.doc.toString());
    const tree = ensureSyntaxTree(state, state.doc.length) || syntaxTree(state);
    tree.iterate({
        enter(node) {
            if (node.name !== 'Image' || node.from < frontmatterEnd) return;
            const line = state.doc.lineAt(node.from);
            if (node.to > line.to) return;
            const imageSource = state.sliceDoc(node.from, node.to);
            if (line.text.trim() !== imageSource || guides.some(guide => (
                guide.type === 'drawio' && guide.from === node.from && guide.to === node.to
            ))) return;
            const plan = markdownBlockGuidePlan({
                name: 'Paragraph',
                source: imageSource,
            });
            if (plan?.type !== 'drawio') return;
            guides.push({
                ...plan,
                from: node.from,
                to: node.to,
                lineFrom: line.from,
                foldFrom: node.from,
                foldTo: node.to,
                title: '',
                foldable: node.to > node.from,
            });
        },
    });
    return guides.sort((left, right) => left.from - right.from || left.to - right.to);
}

function exactFoldExists(state, guide) {
    let found = false;
    foldedRanges(state).between(guide.foldFrom, guide.foldTo, (from, to) => {
        if (from === guide.foldFrom && to === guide.foldTo) found = true;
    });
    return found;
}

class MarkdownBlockGuideMarker extends GutterMarker {
    constructor(guide, folded, showMermaidEditor = false, showDrawioEditor = false, showTableEditor = false) {
        super();
        this.guide = guide;
        this.folded = folded;
        this.showMermaidEditor = showMermaidEditor;
        this.showDrawioEditor = showDrawioEditor;
        this.showTableEditor = showTableEditor;
    }

    eq(other) {
        return this.guide.label === other.guide.label
            && this.guide.foldFrom === other.guide.foldFrom
            && this.guide.foldTo === other.guide.foldTo
            && this.guide.title === other.guide.title
            && this.guide.foldable === other.guide.foldable
            && this.folded === other.folded
            && this.showMermaidEditor === other.showMermaidEditor
            && this.showDrawioEditor === other.showDrawioEditor
            && this.showTableEditor === other.showTableEditor;
    }

    foldControl() {
        const control = document.createElement('button');
        const action = this.folded ? 'Expand' : 'Collapse';
        let subject = 'table';
        if (this.guide.type === 'heading') {
            subject = `${this.guide.label} ${this.guide.title} section`;
        } else if (this.guide.type === 'code') {
            subject = this.guide.label === 'code' ? 'code block' : `${this.guide.label} code block`;
        } else if (this.guide.type === 'drawio') {
            subject = 'Draw.io image';
        }
        control.type = 'button';
        control.className = 'ui-editor-block-guide';
        control.textContent = this.guide.label;
        control.setAttribute('aria-label', `${action} ${subject}`);
        control.setAttribute('aria-expanded', String(!this.folded));
        control.title = `${action} ${subject}`;
        control.dataset.foldFrom = String(this.guide.foldFrom);
        control.dataset.foldTo = String(this.guide.foldTo);
        control.dataset.relevanceFrom = String(this.guide.from);
        control.dataset.relevanceTo = String(this.guide.to);
        control.dataset.guideType = this.guide.type;
        control.disabled = !this.guide.foldable;
        control.addEventListener('mousedown', event => {
            if (event.button === 0) event.preventDefault();
        });
        return control;
    }

    toDOM() {
        const foldControl = this.foldControl();
        if (this.folded) return foldControl;

        const actionControls = [];
        if (this.showMermaidEditor && this.guide.label === 'mermaid') {
            const actionControl = document.createElement('button');
            actionControl.type = 'button';
            actionControl.className = 'ui-editor-block-guide mermaid-editor-guide';
            actionControl.textContent = 'editor';
            actionControl.setAttribute('aria-label', 'Open Mermaid Editor for this diagram');
            actionControl.title = 'Open Mermaid Editor';
            actionControl.dataset.mermaidFrom = String(this.guide.from);
            actionControl.dataset.mermaidTo = String(this.guide.to);
            actionControls.push(actionControl);
        } else if (this.showDrawioEditor && this.guide.type === 'drawio') {
            const actionControl = document.createElement('button');
            actionControl.type = 'button';
            actionControl.className = 'ui-editor-block-guide drawio-editor-guide';
            actionControl.textContent = 'editor';
            actionControl.setAttribute('aria-label', 'Open Draw.io editor for this diagram');
            actionControl.title = 'Open Draw.io editor';
            actionControl.dataset.drawioFrom = String(this.guide.from);
            actionControl.dataset.drawioTo = String(this.guide.to);
            actionControls.push(actionControl);
        } else if (this.guide.type === 'table') {
            if (this.showTableEditor) {
                const editorControl = document.createElement('button');
                editorControl.type = 'button';
                editorControl.className = 'ui-editor-block-guide markdown-table-editor-guide';
                editorControl.textContent = 'editor';
                editorControl.setAttribute('aria-label', 'Open table editor for this table');
                editorControl.title = 'Open table editor';
                editorControl.dataset.tableFrom = String(this.guide.from);
                editorControl.dataset.tableTo = String(this.guide.to);
                actionControls.push(editorControl);
            }
            const deleteControl = document.createElement('button');
            deleteControl.type = 'button';
            deleteControl.className = [
                'ui-editor-block-guide',
                'ui-editor-block-guide--danger',
                'markdown-table-delete-guide',
            ].join(' ');
            deleteControl.textContent = 'delete';
            deleteControl.setAttribute('aria-label', 'Delete table');
            deleteControl.title = 'Delete table';
            deleteControl.dataset.tableFrom = String(this.guide.from);
            deleteControl.dataset.tableTo = String(this.guide.to);
            actionControls.push(deleteControl);
        }
        if (!actionControls.length) return foldControl;

        const stack = document.createElement('div');
        stack.className = 'cm-editor-block-guide-stack';
        actionControls.forEach(actionControl => actionControl.addEventListener('mousedown', event => {
            if (event.button === 0) event.preventDefault();
        }));

        stack.append(foldControl, ...actionControls);
        return stack;
    }
}

class MarkdownBlockGuideSpacer extends GutterMarker {
    toDOM() {
        const spacer = document.createElement('span');
        spacer.className = 'cm-markdownBlockGuideSpacer';
        spacer.textContent = 'x'.repeat(MARKDOWN_BLOCK_GUIDE_MAX_LABEL_LENGTH);
        spacer.setAttribute('aria-hidden', 'true');
        return spacer;
    }
}

const spacerMarker = new MarkdownBlockGuideSpacer();

function guideOnLine(state, lineFrom) {
    return buildMarkdownBlockGuides(state).find(guide => guide.lineFrom === lineFrom) || null;
}

/** Match only a real overlapping replacement block, never an adjacent point widget. */
export function markdownGuideForBlockWidget(guides, block) {
    if (!block || block.to <= block.from) return null;
    return guides.find(candidate => candidate.type !== 'heading' && (
        (candidate.from === block.from && candidate.to === block.to)
        || (block.from < candidate.to && block.to > candidate.from)
    )) || null;
}

function guideControl(view, guide) {
    return view.dom.querySelector(
        `.ui-editor-block-guide[data-fold-from="${guide.foldFrom}"][data-fold-to="${guide.foldTo}"]`,
    );
}

function currentFoldAnchorReserve(view) {
    return Number.parseFloat(view.contentDOM.style.getPropertyValue(foldAnchorReserveProperty)) || 0;
}

function clearFoldAnchorReserve(view) {
    view.contentDOM.style.removeProperty(foldAnchorReserveProperty);
    view.contentDOM.style.removeProperty('padding-bottom');
}

function applyFoldAnchorPlan(view, guide, targetGuideTop, correctionPass = 0) {
    view.requestMeasure({
        read() {
            const control = guideControl(view, guide);
            if (!control) return null;
            return {
                currentGuideTop: control.getBoundingClientRect().top,
                targetGuideTop,
                scrollTop: view.scrollDOM.scrollTop,
                scrollHeight: view.scrollDOM.scrollHeight,
                clientHeight: view.scrollDOM.clientHeight,
                currentReserve: currentFoldAnchorReserve(view),
            };
        },
        write(measurement) {
            if (!measurement) return;
            const plan = markdownFoldAnchorPlan(measurement);
            view.contentDOM.style.setProperty(foldAnchorReserveProperty, `${plan.reserve}px`);
            view.contentDOM.style.setProperty(
                'padding-bottom',
                `calc(40px + ${plan.reserve}px)`,
                'important',
            );
            view.scrollDOM.scrollTop = plan.scrollTop;
            if (correctionPass === 0) {
                applyFoldAnchorPlan(view, guide, targetGuideTop, 1);
            } else if (correctionPass === 1) {
                // Restored block widgets can finish their own CodeMirror
                // measurement after the fold transaction. Re-anchor once on
                // the next painted layout instead of leaving the guide shifted.
                requestAnimationFrame(() => {
                    if (!view.isDestroyed) applyFoldAnchorPlan(view, guide, targetGuideTop, 2);
                });
            }
        },
    });
}

/**
 * Assemble the Markdown helper rail around an injected Mermaid-editor effect.
 * Guide planning and folding stay source-only; the application composition
 * root decides how opening the focused editor is handled.
 */
export function createMarkdownBlockGuidesExtension({ openMermaidEditor, openDrawioEditor, openTableEditor } = {}) {
    const showMermaidEditor = typeof openMermaidEditor === 'function';
    const showDrawioEditor = typeof openDrawioEditor === 'function';
    const showTableEditor = typeof openTableEditor === 'function';
    const markerPlugin = ViewPlugin.fromClass(class {
        constructor(view) {
            synchronizeEditorBlockActionLayout(view);
            this.rebuild(view);
        }

        update(update) {
            if (update.geometryChanged) synchronizeEditorBlockActionLayout(update.view);
            if (update.docChanged) clearFoldAnchorReserve(update.view);
            if (update.docChanged
                || update.viewportChanged
                || update.transactions.some(transaction => transaction.reconfigured)
                || foldedRanges(update.startState) !== foldedRanges(update.state)
                || update.transactions.some(transaction => transaction.effects.some(effect => (
                    effect.is(foldEffect) || effect.is(unfoldEffect)
                )))
                || syntaxTree(update.startState) !== syntaxTree(update.state)) {
                this.rebuild(update.view);
            }
        }

        rebuild(view) {
            this.guides = buildMarkdownBlockGuides(view.state);
            const builder = new RangeSetBuilder();
            for (const guide of this.guides) {
                if (guide.lineFrom < view.viewport.from || guide.lineFrom > view.viewport.to) continue;
                builder.add(guide.lineFrom, guide.lineFrom, new MarkdownBlockGuideMarker(
                    guide,
                    exactFoldExists(view.state, guide),
                    showMermaidEditor,
                    showDrawioEditor,
                    showTableEditor,
                ));
            }
            this.markers = builder.finish();
        }
    });

    const widgetGuide = (view, block) => {
        const guides = view.plugin(markerPlugin)?.guides || [];
        const guide = markdownGuideForBlockWidget(guides, block);
        return guide
            ? new MarkdownBlockGuideMarker(
                guide,
                exactFoldExists(view.state, guide),
                showMermaidEditor,
                showDrawioEditor,
                showTableEditor,
            )
            : null;
    };

    return [
        codeFolding(),
        markdownHeadingFoldingExtension,
        markerPlugin,
        gutter({
            class: 'cm-editorHelperRail cm-editorHelperRail-before cm-markdownBlockGutter',
            markers(view) {
                return view.plugin(markerPlugin)?.markers || RangeSet.empty;
            },
            initialSpacer() {
                return spacerMarker;
            },
            widgetMarker(view, _widget, block) {
                return widgetGuide(view, block);
            },
            domEventHandlers: {
                click(view, line, event) {
                    const tableEditorControl = event.target?.closest?.('.markdown-table-editor-guide');
                    if (tableEditorControl) {
                        const requestedFrom = Number(tableEditorControl.dataset.tableFrom);
                        const requestedTo = Number(tableEditorControl.dataset.tableTo);
                        const guide = buildMarkdownBlockGuides(view.state).find(candidate => (
                            candidate.type === 'table'
                            && candidate.from === requestedFrom
                            && candidate.to === requestedTo
                        )) || guideOnLine(view.state, line.from);
                        if (guide?.type === 'table') openTableEditor?.(view, guide, tableEditorControl);
                        return true;
                    }

                    const deleteControl = event.target?.closest?.('.markdown-table-delete-guide');
                    if (deleteControl) {
                        const requestedFrom = Number(deleteControl.dataset.tableFrom);
                        const requestedTo = Number(deleteControl.dataset.tableTo);
                        const guide = buildMarkdownBlockGuides(view.state).find(candidate => (
                            candidate.type === 'table'
                            && candidate.from === requestedFrom
                            && candidate.to === requestedTo
                        )) || guideOnLine(view.state, line.from);
                        if (guide?.type !== 'table') return true;
                        view.dispatch({
                            annotations: Transaction.userEvent.of('table.delete'),
                            changes: { from: guide.from, to: guide.to },
                        });
                        view.focus();
                        return true;
                    }

                    const editorControl = event.target?.closest?.('.mermaid-editor-guide');
                    if (editorControl) {
                        const requestedFrom = Number(editorControl.dataset.mermaidFrom);
                        const requestedTo = Number(editorControl.dataset.mermaidTo);
                        const guide = buildMarkdownBlockGuides(view.state).find(candidate => (
                            candidate.label === 'mermaid'
                            && candidate.from === requestedFrom
                            && candidate.to === requestedTo
                        )) || guideOnLine(view.state, line.from);
                        if (guide?.label === 'mermaid') openMermaidEditor?.(view, guide);
                        return true;
                    }

                    const drawioControl = event.target?.closest?.('.drawio-editor-guide');
                    if (drawioControl) {
                        const requestedFrom = Number(drawioControl.dataset.drawioFrom);
                        const requestedTo = Number(drawioControl.dataset.drawioTo);
                        const guide = buildMarkdownBlockGuides(view.state).find(candidate => (
                            candidate.type === 'drawio'
                            && candidate.from === requestedFrom
                            && candidate.to === requestedTo
                        )) || guideOnLine(view.state, line.from);
                        if (guide?.type !== 'drawio') return true;
                        drawioControl.disabled = true;
                        drawioControl.setAttribute('aria-busy', 'true');
                        Promise.resolve(openDrawioEditor?.(view, guide)).catch(() => {}).finally(() => {
                            if (!drawioControl.isConnected) return;
                            drawioControl.disabled = false;
                            drawioControl.removeAttribute('aria-busy');
                        });
                        return true;
                    }

                    const control = event.target?.closest?.('.ui-editor-block-guide[data-fold-from]');
                    if (!control) return false;
                    const requestedFrom = Number(control.dataset.foldFrom);
                    const requestedTo = Number(control.dataset.foldTo);
                    const guide = buildMarkdownBlockGuides(view.state).find(candidate => (
                        candidate.foldFrom === requestedFrom && candidate.foldTo === requestedTo
                    )) || guideOnLine(view.state, line.from);
                    if (!guide?.foldable) return true;
                    const targetGuideTop = control.getBoundingClientRect().top;
                    const folded = exactFoldExists(view.state, guide);
                    const range = { from: guide.foldFrom, to: guide.foldTo };
                    const effect = folded ? unfoldEffect : foldEffect;
                    view.dispatch({ effects: effect.of(range) });
                    view.contentDOM.focus({ preventScroll: true });
                    applyFoldAnchorPlan(view, guide, targetGuideTop);
                    return true;
                },
            },
        }),
        keymap.of(foldKeymap),
    ];
}

export default createMarkdownBlockGuidesExtension;
