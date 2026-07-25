import { createEditorDocumentSession } from '../frontend/js/usecases/editorDocumentSession.js';

function harness() {
    const scheduled = [];
    const editor = { content: 'before', destroyed: false };
    const applyContent = jest.fn((target, request) => {
        target.content = request.content;
    });
    let activeTabId = 'first.md';
    const session = createEditorDocumentSession({
        schedule: callback => scheduled.push(callback),
        readEditor: () => editor,
        editorUnavailable: target => !target || target.destroyed,
        readActiveTabId: () => activeTabId,
        readContent: target => target.content,
        beforeReplace: jest.fn(),
        applyContent,
        restoreSelection: jest.fn(),
        reportFailure: jest.fn(),
    });
    return {
        scheduled,
        editor,
        applyContent,
        session,
        setActiveTabId(value) {
            activeTabId = value;
        },
    };
}

describe('shared editor document session', () => {
    test('drops an older scheduled mount when a newer request replaces it', () => {
        const { scheduled, editor, applyContent, session } = harness();
        session.mount('first', 'first.md');
        session.mount('second', 'first.md');

        scheduled[0]();
        expect(applyContent).not.toHaveBeenCalled();
        scheduled[1]();
        expect(editor.content).toBe('second');
        expect(session.documentTabId()).toBe('first.md');
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
            applyContent,
            restoreSelection,
        });

        session.mount('same', 'note.md', { anchor: 2, head: 2 });
        scheduled[0]();

        expect(applyContent).not.toHaveBeenCalled();
        expect(restoreSelection).toHaveBeenCalledWith('note.md', { anchor: 2, head: 2 });
        expect(session.documentTabId()).toBe('note.md');
    });
});
