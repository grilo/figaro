import { ViewPlugin } from '@codemirror/view';
import { indexWritingLinkFindings, writingLinkFindingsInRange, writingLinkLabel, writingLinkSegments } from './core/writingLinkModel.js';

/** Decorate only mounted link labels after CodeMirror has drawn its widgets. */
export function createWritingLinkHints(readFindings, queryFindings = null) {
    return ViewPlugin.fromClass(class {
        constructor(view) { this.links = new Map(); this.mounted = new Map(); this.schedule(view); }
        schedule(view) { view.requestMeasure({ key: this, read: () => null, write: () => this.docViewUpdate(view) }); }
        update(update) {
            // Marks wholly covered by replacements may not trigger a DOM redraw.
            if (readFindings(update.startState) !== readFindings(update.state)) this.schedule(update.view);
        }
        docViewUpdate(view) {
            this.findings = readFindings(view.state);
            if (this.index?.findings !== this.findings) {
                this.index = queryFindings ? { findings: this.findings } : indexWritingLinkFindings(this.findings);
                this.visible = null;
            }
            const { from: visibleFrom, to: visibleTo } = view.viewport;
            if (!this.visible || visibleFrom !== this.visible.from || visibleTo !== this.visible.to) {
                this.visible = { from: visibleFrom, to: visibleTo,
                    findings: this.inRange(visibleFrom, visibleTo) };
            }
            const findings = this.visible.findings, previous = this.mounted;
            const hadMarkedLinks = this.links.size > 0;
            this.links = new Map();
            this.mounted = new Map();
            if (!findings.length && !hadMarkedLinks) return;
            for (const anchor of view.contentDOM.querySelectorAll('.cm-link-widget')) {
                const parent = anchor.parentNode, index = [...parent.childNodes].indexOf(anchor);
                const from = view.posAtDOM(parent, index), to = view.posAtDOM(parent, index + 1);
                const label = anchor.textContent, old = previous.get(anchor);
                if (old?.document === view.state.doc && old.from === from && old.to === to
                    && old.label === label && old.visible === this.visible) {
                    this.mounted.set(anchor, old);
                    if (old.findings.length) this.links.set(anchor, old);
                    continue;
                }
                const source = view.state.doc.sliceString(from, to);
                const range = writingLinkLabel(source, label, from);
                const plan = range && writingLinkSegments(label, range,
                    this.inRange(range.from, range.to));
                const info = old?.info ?? (anchor.getAttribute('data-ui-tooltip') || anchor.getAttribute('title') || '');
                const entry = { document: view.state.doc, from, to, label, visible: this.visible,
                    findings: plan?.findings || [], info };
                this.mounted.set(anchor, entry);
                if (!plan?.findings.length) {
                    if (old?.findings.length) { anchor.textContent = label; delete anchor.dataset.writingLink; if (info) anchor.setAttribute('data-ui-tooltip', info); }
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
                Object.assign(entry, { key, destination });
                this.links.set(anchor, entry);
            }
        }
        inRange(from, to) {
            return queryFindings ? queryFindings(this.findings, from, to) : writingLinkFindingsInRange(this.index, from, to);
        }
        at(position, findings) {
            if (findings !== this.findings) return null; // Paint may await the next measure; actions must already be current.
            return [...this.links.values()].find(link => position >= link.from && position <= link.to);
        }
    });
}
