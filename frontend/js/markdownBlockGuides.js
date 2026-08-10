import { RangeSet, RangeSetBuilder } from '@codemirror/state';
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
import {
    leadingFrontmatterEnd,
    markdownHeadingLevel,
    markdownBlockGuidePlan,
} from './core/markdownBlockGuideModel.js';

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
        blocks.push({
            name: node.name,
            from: node.from,
            to: node.to,
            source: state.sliceDoc(node.from, node.to),
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
    return guides;
}

function exactFoldExists(state, guide) {
    let found = false;
    foldedRanges(state).between(guide.foldFrom, guide.foldTo, (from, to) => {
        if (from === guide.foldFrom && to === guide.foldTo) found = true;
    });
    return found;
}

class MarkdownBlockGuideMarker extends GutterMarker {
    constructor(guide, folded) {
        super();
        this.guide = guide;
        this.folded = folded;
    }

    eq(other) {
        return this.guide.label === other.guide.label
            && this.guide.foldFrom === other.guide.foldFrom
            && this.guide.foldTo === other.guide.foldTo
            && this.guide.title === other.guide.title
            && this.guide.foldable === other.guide.foldable
            && this.folded === other.folded;
    }

    toDOM() {
        const control = document.createElement('button');
        const action = this.folded ? 'Expand' : 'Collapse';
        let subject = 'table';
        if (this.guide.type === 'heading') {
            subject = `${this.guide.label} ${this.guide.title} section`;
        } else if (this.guide.type === 'code') {
            subject = this.guide.label === 'code' ? 'code block' : `${this.guide.label} code block`;
        }
        control.type = 'button';
        control.className = 'ui-editor-block-guide';
        control.textContent = this.guide.label;
        control.setAttribute('aria-label', `${action} ${subject}`);
        control.setAttribute('aria-expanded', String(!this.folded));
        control.title = `${action} ${subject}`;
        control.dataset.foldFrom = String(this.guide.foldFrom);
        control.dataset.foldTo = String(this.guide.foldTo);
        control.disabled = !this.guide.foldable;
        control.addEventListener('mousedown', event => {
            if (event.button === 0) event.preventDefault();
        });
        return control;
    }
}

class MarkdownBlockGuideSpacer extends GutterMarker {
    toDOM() {
        const spacer = document.createElement('span');
        spacer.className = 'cm-markdownBlockGuideSpacer';
        spacer.textContent = 'table';
        spacer.setAttribute('aria-hidden', 'true');
        return spacer;
    }
}

const spacerMarker = new MarkdownBlockGuideSpacer();

const markerPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
        this.rebuild(view);
    }

    update(update) {
        if (update.docChanged
            || update.viewportChanged
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
            ));
        }
        this.markers = builder.finish();
    }
});

function widgetGuide(view, block) {
    const guides = view.plugin(markerPlugin)?.guides || [];
    const guide = guides.find(candidate => candidate.type !== 'heading' && (
        (candidate.from === block.from && candidate.to === block.to)
        || (block.from <= candidate.from && block.to >= candidate.to)
        || (candidate.from <= block.from && candidate.to >= block.to)
    ));
    return guide
        ? new MarkdownBlockGuideMarker(guide, exactFoldExists(view.state, guide))
        : null;
}

function guideOnLine(state, lineFrom) {
    return buildMarkdownBlockGuides(state).find(guide => guide.lineFrom === lineFrom) || null;
}

export const markdownBlockGuidesExtension = [
    codeFolding(),
    markdownHeadingFoldingExtension,
    markerPlugin,
    gutter({
        class: 'cm-markdownBlockGutter',
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
                const control = event.target?.closest?.('.ui-editor-block-guide');
                if (!control) return false;
                const requestedFrom = Number(control.dataset.foldFrom);
                const requestedTo = Number(control.dataset.foldTo);
                const guide = buildMarkdownBlockGuides(view.state).find(candidate => (
                    candidate.foldFrom === requestedFrom && candidate.foldTo === requestedTo
                )) || guideOnLine(view.state, line.from);
                if (!guide?.foldable) return true;
                const effect = exactFoldExists(view.state, guide) ? unfoldEffect : foldEffect;
                view.dispatch({ effects: effect.of({ from: guide.foldFrom, to: guide.foldTo }) });
                view.focus();
                return true;
            },
        },
    }),
    keymap.of(foldKeymap),
];

export default markdownBlockGuidesExtension;
