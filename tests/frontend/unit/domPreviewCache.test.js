import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createDOMPreviewCache } from '../frontend/js/domPreviewCache.js';

test('DOM preview sessions transfer one detached subtree, validate identity, bound retention and stop at extension disposal', async () => {
    const previews = createDOMPreviewCache({ maximumEntries: 1, maximumWeight: 1024 });
    const compartment = new Compartment();
    const view = new EditorView({ state: EditorState.create({ extensions: [compartment.of(previews.extension)] }), parent: document.body });
    const session = previews.forView(view), first = {}, second = {}, renderer = {};
    const node = document.createElement('span'); node.textContent = 'prepared'; view.dom.append(node);
    const entry = previews.prepare(node, 'source', renderer);
    try {
        expect(session.retain(first, entry)).toBe(true);
        await Promise.resolve();
        expect(node.isConnected).toBe(false);
        expect(session.take(first, 'different', renderer)).toBeNull();
        session.retain(first, entry);
        expect(session.take(first, 'source', {})).toBeNull();
        session.retain(first, entry);
        expect(session.take(first, 'source', renderer)).toBe(entry);
        expect(session.take(first, 'source', renderer)).toBeNull();
        const oldMount = document.createElement('div'), newMount = document.createElement('div');
        view.dom.append(oldMount, newMount);
        oldMount.append(node);
        session.retain(first, entry);
        newMount.append(session.take(first, 'source', renderer).node);
        await Promise.resolve();
        expect(node.parentNode).toBe(newMount);
        expect(node.isConnected).toBe(true);
        session.retain(first, entry); session.retain(second, entry);
        expect(session.take(first, 'source', renderer)).toBeNull();
        expect(session.stats().entries).toBe(1);
        expect(session.retain(first, { ...entry, weight: 1025 })).toBe(false);
        view.dispatch({ effects: compartment.reconfigure([]) });
        expect(session.stats()).toEqual({ entries: 0, weight: 0 });
        expect(session.retain(first, entry)).toBe(false);
    } finally { view.destroy(); }
});
