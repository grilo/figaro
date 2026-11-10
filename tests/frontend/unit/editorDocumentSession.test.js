import { createEditorDocumentSession } from '../frontend/js/usecases/editorDocumentSession.js';

function harness() {
    const scheduled = [];
    const editor = { content: 'before', destroyed: false };
    const applyContent = jest.fn((target, request) => {
        target.content = request.content;
    });
    const switchDocument = jest.fn((target, request, contentChanged) => {
        if (contentChanged) target.content = request.content;
    });
    let activeTabId = 'first.md';
    const session = createEditorDocumentSession({
        schedule: callback => scheduled.push(callback),
        readEditor: () => editor,
        editorUnavailable: target => !target || target.destroyed,
        readActiveTabId: () => activeTabId,
        readContent: target => target.content,
        beforeReplace: jest.fn(),
        switchDocument,
        applyContent,
        restoreSelection: jest.fn(),
        reportFailure: jest.fn(),
    });
    return {
        scheduled,
        editor,
        applyContent,
        switchDocument,
        session,
        setActiveTabId(value) {
            activeTabId = value;
        },
    };
}

describe('shared editor document session', () => {
    test('drops an older scheduled mount when a newer request replaces it', async () => {
        const { scheduled, editor, applyContent, session } = harness();
        const firstMount = session.mount('first', 'first.md');
        const secondMount = session.mount('second', 'first.md');

        scheduled[0]();
        await expect(firstMount).resolves.toBe(false);
        expect(applyContent).not.toHaveBeenCalled();
        scheduled[1]();
        await expect(secondMount).resolves.toBe(true);
        expect(editor.content).toBe('second');
        expect(session.documentTabId()).toBe('first.md');
    });

    test('settles a mount only after the scheduled editor replacement has landed', async () => {
        const { scheduled, editor, session } = harness();
        let settled = false;

        const mount = session.mount('restored source', 'first.md')
            .then(result => {
                settled = true;
                return result;
            });
        await Promise.resolve();

        expect(settled).toBe(false);
        expect(editor.content).toBe('before');

        scheduled[0]();

        await expect(mount).resolves.toBe(true);
        expect(settled).toBe(true);
        expect(editor.content).toBe('restored source');
    });

    test('does not mount a document after another tab becomes active', () => {
        const { scheduled, applyContent, session, setActiveTabId } = harness();
        session.mount('first', 'first.md');
        setActiveTabId('second.md');
        scheduled[0]();

        expect(applyContent).not.toHaveBeenCalled();
        expect(session.documentTabId()).toBeNull();
    });

    test('records ownership and restores selection without replacing identical content', () => {
        const scheduled = [];
        const restoreSelection = jest.fn();
        const editor = { content: 'same' };
        const applyContent = jest.fn();
        const session = createEditorDocumentSession({
            schedule: callback => scheduled.push(callback),
            readEditor: () => editor,
            editorUnavailable: target => !target,
            readActiveTabId: () => 'note.md',
            readContent: target => target.content,
            beforeReplace: jest.fn(),
            switchDocument: jest.fn(),
            applyContent,
            restoreSelection,
        });

        session.mount('same', 'note.md', { anchor: 2, head: 2 });
        scheduled[0]();

        expect(applyContent).not.toHaveBeenCalled();
        expect(restoreSelection).toHaveBeenCalledWith('note.md', { anchor: 2, head: 2 });
        expect(session.documentTabId()).toBe('note.md');
    });

    test('switches undo history ownership even when the next document text is identical', () => {
        const { scheduled, editor, switchDocument, session, setActiveTabId } = harness();
        editor.content = 'same text';

        session.mount('same text', 'first.md');
        scheduled[0]();
        switchDocument.mockClear();

        setActiveTabId('second.md');
        session.mount('same text', 'second.md');
        scheduled[1]();

        expect(switchDocument).toHaveBeenCalledTimes(1);
        expect(switchDocument).toHaveBeenCalledWith(editor, expect.objectContaining({
            tabId: 'second.md',
            previousTabId: 'first.md',
            documentChanged: true,
        }), false);
        expect(session.documentTabId()).toBe('second.md');
    });
    test('a rejected replacement leaves the previous document attributed to its own tab', async () => {
        const { scheduled, editor, switchDocument, session, setActiveTabId } = harness();
        session.mount('first note', 'first.md');
        scheduled[0]();
        expect(session.documentTabId()).toBe('first.md');

        // The editor refuses the transaction: nothing was replaced.
        switchDocument.mockImplementationOnce(() => { throw new RangeError('Selection points outside of document'); });
        setActiveTabId('second.md');
        const mount = session.mount('second note', 'second.md');
        scheduled[1]();

        await expect(mount).resolves.toBe(false);
        expect(editor.content).toBe('first note');
        // Otherwise the next keystroke and save would write the first note's
        // text into second.md.
        expect(session.documentTabId()).toBe('first.md');
    });

    test('a replacement that landed before a later failure keeps the new owner', async () => {
        const { scheduled, editor, switchDocument, session, setActiveTabId } = harness();
        session.mount('first note', 'first.md');
        scheduled[0]();

        switchDocument.mockImplementationOnce((target, request) => {
            target.content = request.content;
            throw new Error('presentation could not be attached');
        });
        setActiveTabId('second.md');
        const mount = session.mount('second note', 'second.md');
        scheduled[1]();

        await expect(mount).resolves.toBe(false);
        expect(editor.content).toBe('second note');
        expect(session.documentTabId()).toBe('second.md');
    });

    test('a renamed tab keeps ownership of the mounted document', () => {
        const { scheduled, applyContent, editor, session, setActiveTabId } = harness();
        session.mount('note text', 'notes/a.md');
        setActiveTabId('notes/a.md');
        scheduled[0]();
        expect(session.documentTabId()).toBe('notes/a.md');

        expect(session.renameDocumentTab('notes/a.md', 'notes/b.md')).toBe(true);
        expect(session.documentTabId()).toBe('notes/b.md');

        // The same buffer under its new ID is not a document switch.
        setActiveTabId('notes/b.md');
        session.mount('note text edited', 'notes/b.md');
        scheduled[1]();
        expect(applyContent).toHaveBeenCalledTimes(1);
        expect(editor.content).toBe('note text edited');

        expect(session.renameDocumentTab('unrelated.md', 'elsewhere.md')).toBe(false);
        expect(session.renameDocumentTab('notes/b.md', 'notes/b.md')).toBe(false);
        expect(session.documentTabId()).toBe('notes/b.md');
    });

    test('a mount queued before a rename still lands on the renamed tab', async () => {
        const { scheduled, editor, session, setActiveTabId } = harness();
        setActiveTabId('notes/a.md');
        const mount = session.mount('loaded from disk', 'notes/a.md');

        session.renameDocumentTab('notes/a.md', 'notes/b.md');
        setActiveTabId('notes/b.md');
        scheduled[0]();

        await expect(mount).resolves.toBe(true);
        expect(editor.content).toBe('loaded from disk');
        expect(session.documentTabId()).toBe('notes/b.md');
    });
});
