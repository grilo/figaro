import { EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { createMarkdownBlockGuidesExtension } from '../../../frontend/js/markdownBlockGuides.js';
import { createBlockControlVisibilityExtension } from '../../../frontend/js/blockControlVisibility.js';

function clock() {
    let now = 0;
    const jobs = new Map();
    return {
        schedule: (run, delay) => { const id = {}; jobs.set(id, { run, at: now + delay }); return id; },
        unschedule: id => jobs.delete(id),
        advance(ms) { now += ms; for (const [id, job] of [...jobs]) if (job.at <= now) { jobs.delete(id); job.run(); } },
        size: () => jobs.size,
    };
}

test('hovered diagram controls retain their reveal state when typing remaps CodeMirror gutter markers', () => {
    const parent = document.body.appendChild(document.createElement('div'));
    const timers = clock();
    const visibility = createBlockControlVisibilityExtension(ViewPlugin, timers);
    const view = new EditorView({ parent, state: EditorState.create({
        doc: 'Before\n\n```mermaid\nflowchart TD\nA --> B\n```\n\nAfter',
        extensions: [markdownLanguage, createMarkdownBlockGuidesExtension({ openMermaidEditor() {} }), visibility],
    }) });
    try {
        let measure;
        view.requestMeasure = value => { if (value?.key === view.plugin(visibility)) measure = value; };
        const control = parent.querySelector('.mermaid-editor-guide');
        const owner = control.closest('.cm-gutterElement');
        owner.getBoundingClientRect = () => ({ left: 50, right: 95, top: 100, bottom: 200 });
        view.contentDOM.getBoundingClientRect = () => ({ left: 100, right: 700 });
        view.coordsAtPos = () => null;
        view.dom.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 150 }));
        timers.advance(100);
        measure.write(measure.read(view));
        const revealed = () => owner.hasAttribute('data-block-control-relevant');
        expect(revealed()).toBe(true);
        const priorFrom = control.dataset.mermaidFrom;
        view.dispatch({ changes: { from: 0, insert: 'Typing ' }, userEvent: 'input.type' });
        const remapped = parent.querySelector('.mermaid-editor-guide');
        expect(remapped.dataset.mermaidFrom).not.toBe(priorFrom);
        expect(remapped.closest('.cm-gutterElement')).toBe(owner);
        // Assert before the next measurement can restore a flag lost by CodeMirror.
        expect(revealed()).toBe(true);
        view.dom.dispatchEvent(new MouseEvent('pointerleave'));
        timers.advance(100);
        measure.write(measure.read(view));
        expect(revealed()).toBe(false);
    } finally { view.destroy(); parent.remove(); }
});

test('block control measurements wait through sustained typing, coalesce pointer movement and flush promptly for keyboard focus', () => {
    const timers = clock();
    const parent = document.body.appendChild(document.createElement('div'));
    const visibility = createBlockControlVisibilityExtension(ViewPlugin, timers);
    const view = new EditorView({ parent, state: EditorState.create({ doc: 'Ordinary prose.', extensions: [visibility] }) });
    const plugin = view.plugin(visibility);
    const requests = [];
    view.requestMeasure = request => { if (request?.key === plugin) requests.push(request); };
    try {
        for (let at = 0; at < 20; at++) {
            view.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' });
            timers.advance(30);
        }
        expect(requests).toHaveLength(0);
        timers.advance(70);
        expect(requests).toHaveLength(1);
        const bounds = jest.spyOn(view.contentDOM, 'getBoundingClientRect');
        expect(requests[0].read(view)).toEqual([]);
        expect(bounds).not.toHaveBeenCalled(); // No controls means no geometry work.
        for (let at = 0; at < 10; at++) view.dom.dispatchEvent(new MouseEvent('pointermove', { clientX: at }));
        timers.advance(32); expect(requests).toHaveLength(2);
        view.dispatch({ selection: { anchor: 1 } });
        view.dom.dispatchEvent(new FocusEvent('focusin'));
        timers.advance(0); expect(requests).toHaveLength(3);
        view.dom.dispatchEvent(new MouseEvent('pointerleave'));
        view.destroy(); expect(timers.size()).toBe(0);
    } finally { if (!view.isDestroyed) view.destroy(); parent.remove(); }
});
