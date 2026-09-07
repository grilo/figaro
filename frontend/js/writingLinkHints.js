import { ViewPlugin } from '@codemirror/view';
import { writingLinkLabel, writingLinkSegments } from './core/writingLinkModel.js';

/** Decorate only mounted link labels after CodeMirror has drawn its widgets. */
export function createWritingLinkHints(readFindings) {
    return ViewPlugin.fromClass(class {
        constructor(view) { this.links = new Map(); this.schedule(view); }
        schedule(view) { view.requestMeasure({ key: this, read: () => null, write: () => this.docViewUpdate(view) }); }
        update(update) {
            // Marks wholly covered by replacements may not trigger a DOM redraw.
            if (readFindings(update.startState) !== readFindings(update.state)) this.schedule(update.view);
        }
        docViewUpdate(view) {
            this.findings = readFindings(view.state);
            const findings = this.findings.filter(item => item.from < view.viewport.to && item.to > view.viewport.from), previous = this.links;
            this.links = new Map();
            if (!findings.length && !previous.size) return;
            for (const anchor of view.contentDOM.querySelectorAll('.cm-link-widget')) {
                const parent = anchor.parentNode, index = [...parent.childNodes].indexOf(anchor);
                const from = view.posAtDOM(parent, index), to = view.posAtDOM(parent, index + 1);
                const source = view.state.doc.sliceString(from, to), label = anchor.textContent;
                const range = writingLinkLabel(source, label, from);
                const plan = range && writingLinkSegments(label, range, findings);
                const old = previous.get(anchor);
                const info = old?.info ?? (anchor.getAttribute('data-ui-tooltip') || anchor.getAttribute('title') || '');
                if (!plan?.findings.length) {
                    if (old) { anchor.textContent = label; delete anchor.dataset.writingLink; if (info) anchor.setAttribute('data-ui-tooltip', info); }
                    continue;
                }
                const key = JSON.stringify(plan.segments);
                if (old?.key !== key) anchor.replaceChildren(...plan.segments.map(segment => {
                    if (!segment.marked) return document.createTextNode(segment.text);
                    const span = document.createElement('span'); span.className = 'cm-lintRange cm-writing-range'; span.textContent = segment.text; return span;
                }));
                anchor.dataset.writingLink = '';
                anchor.removeAttribute('title'); anchor.removeAttribute('data-ui-tooltip');
                const destination = source.startsWith('[[') ? source.slice(2, source.indexOf('|')) : anchor.getAttribute('href') || '';
                this.links.set(anchor, { from, to, findings: plan.findings, key, info, destination });
            }
        }
        at(position, findings) {
            if (findings !== this.findings) return null; // Paint may await the next measure; actions must already be current.
            return [...this.links.values()].find(link => position >= link.from && position <= link.to);
        }
    });
}
