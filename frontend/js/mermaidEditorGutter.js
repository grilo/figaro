import { RangeSet, RangeSetBuilder } from '@codemirror/state';
import { GutterMarker, ViewPlugin, gutter } from '@codemirror/view';

const MERMAID_SIDE_ACTION_MIN_WIDTH = 360;

/** Publish the visible editor width so a horizontally scrollable document cannot cover the sticky action rail. */
export function synchronizeMermaidEditorViewportWidth(view, width = view?.dom?.getBoundingClientRect?.().width) {
    if (!view || view.isDestroyed || !Number.isFinite(width)) return;
    view.dom.style.setProperty('--mermaid-editor-viewport-width', `${Math.max(0, width)}px`);
    view.scrollDOM?.classList.toggle('cm-mermaid-editor-stacked', width < MERMAID_SIDE_ACTION_MIN_WIDTH);
}

/** Read the Mermaid blocks already scanned by the live-diagram state field. */
export function buildMermaidEditorGuides(state, diagramField) {
    const value = diagramField ? state.field(diagramField, false) : null;
    return (value?.blocks || [])
        .filter(block => block.lang === 'mermaid')
        .map(block => ({ ...block, lineFrom: block.lineFrom ?? block.from }));
}

class MermaidEditorMarker extends GutterMarker {
    constructor(guide) {
        super();
        this.guide = guide;
    }

    eq(other) {
        return other instanceof MermaidEditorMarker
            && other.guide.from === this.guide.from
            && other.guide.to === this.guide.to
            && other.guide.rawCode === this.guide.rawCode;
    }

    toDOM() {
        const control = document.createElement('button');
        control.type = 'button';
        control.className = 'ui-editor-block-guide mermaid-editor-guide';
        control.textContent = 'Mermaid Editor';
        control.setAttribute('aria-label', 'Open Mermaid Editor for this diagram');
        control.title = 'Open Mermaid Editor';
        control.dataset.mermaidFrom = String(this.guide.from);
        control.dataset.mermaidTo = String(this.guide.to);
        control.addEventListener('mousedown', event => {
            if (event.button === 0) event.preventDefault();
        });
        return control;
    }
}

/** Create the right-side Mermaid action gutter for the assembled editor. */
export function createMermaidEditorGutterExtension({ diagramField, openEditor }) {
    const markerPlugin = ViewPlugin.fromClass(class {
        constructor(view) {
            synchronizeMermaidEditorViewportWidth(view);
            this.rebuild(view);
        }

        update(update) {
            if (update.geometryChanged) synchronizeMermaidEditorViewportWidth(update.view);
            if (update.docChanged || update.viewportChanged || update.transactions.some(transaction => transaction.reconfigured)) {
                this.rebuild(update.view);
            }
        }

        rebuild(view) {
            this.guides = buildMermaidEditorGuides(view.state, diagramField);
            const builder = new RangeSetBuilder();
            for (const guide of this.guides) {
                if (guide.lineFrom < view.viewport.from || guide.lineFrom > view.viewport.to) continue;
                builder.add(guide.lineFrom, guide.lineFrom, new MermaidEditorMarker(guide));
            }
            this.markers = builder.finish();
        }
    });

    const markerForWidget = (view, block) => {
        const guide = view.plugin(markerPlugin)?.guides.find(candidate => (
            candidate.from === block.from && candidate.to === block.to
        ));
        return guide ? new MermaidEditorMarker(guide) : null;
    };

    return [
        markerPlugin,
        gutter({
            class: 'cm-mermaidEditorGutter',
            side: 'after',
            markers(view) {
                return view.plugin(markerPlugin)?.markers || RangeSet.empty;
            },
            widgetMarker(view, _widget, block) {
                return markerForWidget(view, block);
            },
            domEventHandlers: {
                click(view, line, event) {
                    const control = event.target?.closest?.('.mermaid-editor-guide');
                    if (!control) return false;
                    const requestedFrom = Number(control.dataset.mermaidFrom);
                    const requestedTo = Number(control.dataset.mermaidTo);
                    const guide = buildMermaidEditorGuides(view.state, diagramField).find(candidate => (
                        candidate.from === requestedFrom && candidate.to === requestedTo
                    )) || buildMermaidEditorGuides(view.state, diagramField).find(candidate => candidate.lineFrom === line.from);
                    if (guide) openEditor?.(view, guide);
                    return true;
                },
            },
        }),
    ];
}

export default createMermaidEditorGutterExtension;
