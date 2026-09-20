import { createLinkedNoteNavigation } from '../frontend/js/usecases/linkedNoteNavigation.js';

function setup(overrides = {}) {
    const ports = {
        read: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ success: true, mtime: 42 }),
        getTabs: jest.fn(() => []), getTree: jest.fn(() => []),
        openTab: jest.fn(), replaceTab: jest.fn(), confirm: jest.fn().mockResolvedValue(true),
        error: jest.fn(), replaceTarget: jest.fn(() => true), reportIssue: jest.fn(),
        navigateHeading: jest.fn(), now: jest.fn(() => 100), refreshTree: jest.fn(),
        log: { debug: jest.fn(), error: jest.fn() }, ...overrides,
    };
    return { ports, navigate: createLinkedNoteNavigation(ports) };
}

describe('linked-note navigation use case', () => {
    test('delegates local heading navigation without file I/O', async () => {
        const { ports, navigate } = setup();
        await expect(navigate('#intro')).resolves.toBe(true);
        expect(ports.navigateHeading).toHaveBeenCalledWith('#intro');
        expect(ports.read).not.toHaveBeenCalled();
    });

    test('opens date mentions through the shared tab policy without file I/O', async () => {
        const { ports, navigate } = setup();
        await navigate('', '2026-09-13', true);
        expect(ports.replaceTab).toHaveBeenCalledWith('calendar-2026-09-13', 'Mention of Date: [[2026-09-13]]', 'calendar', { dateStr: '2026-09-13' });
        expect(ports.read).not.toHaveBeenCalled();
    });

    test('checks current tabs after the read and reuses a destination opened meanwhile', async () => {
        let resolveRead;
        const { ports, navigate } = setup({ read: jest.fn(() => new Promise(resolve => { resolveRead = resolve; })) });
        const pending = navigate('Guide%2520Note.md', '', true);
        ports.getTabs.mockReturnValue([{ id: 'Guide Note.md' }]);
        resolveRead({ mtime: 7 });
        await pending;
        expect(ports.read).toHaveBeenCalledWith('Guide Note.md');
        expect(ports.openTab).toHaveBeenCalledWith('Guide Note.md', 'Guide Note.md', 'file', { path: 'Guide Note.md', mtime: 7 });
        expect(ports.replaceTab).not.toHaveBeenCalled();
    });

    test('replaces the current tab for an existing file only on a replace request', async () => {
        const { ports, navigate } = setup({ read: jest.fn().mockResolvedValue({ mtime: 7 }) });
        await navigate('notes/Guide.md', '', true);
        expect(ports.replaceTab).toHaveBeenCalledWith('notes/Guide.md', 'Guide.md', 'file', { path: 'notes/Guide.md', mtime: 7 });
        expect(ports.create).not.toHaveBeenCalled();
    });

    test('cancelling a missing note leaves files and tabs untouched', async () => {
        const { ports, navigate } = setup({ confirm: jest.fn().mockResolvedValue(false) });
        await navigate('notes/New');
        expect(ports.confirm).toHaveBeenCalledWith('Create this note?', expect.stringContaining('Path: notes/New.md'), false, false, expect.objectContaining({ confirmLabel: 'Create note' }));
        expect(ports.create).not.toHaveBeenCalled();
        expect(ports.openTab).not.toHaveBeenCalled();
    });

    test('confirmed creation opens a new tab and refreshes only after a successful create', async () => {
        const { ports, navigate } = setup();
        await navigate('notes/New', '', true);
        expect(ports.create).toHaveBeenCalledWith('notes/New.md', '# New\n\n');
        expect(ports.openTab).toHaveBeenCalledWith('notes/New.md', 'New.md', 'file', { path: 'notes/New.md', mtime: 42 }, true);
        expect(ports.replaceTab).not.toHaveBeenCalled();
        expect(ports.refreshTree).toHaveBeenCalledTimes(1);
        expect(ports.create.mock.invocationCallOrder[0]).toBeLessThan(ports.openTab.mock.invocationCallOrder[0]);
    });

    test('a backend create collision reports the error without opening or refreshing', async () => {
        const { ports, navigate } = setup({ create: jest.fn().mockResolvedValue({ success: false, error: 'Already exists' }) });
        await navigate('notes/New');
        expect(ports.error).toHaveBeenCalledWith('Couldn’t create note', 'Already exists', 'The linked note could not be created.');
        expect(ports.openTab).not.toHaveBeenCalled();
        expect(ports.refreshTree).not.toHaveBeenCalled();
    });

    test('a file issue is reported without creation or opening', async () => {
        const { ports, navigate } = setup({ read: jest.fn().mockResolvedValue({ issue: { kind: 'denied' } }) });
        await navigate('private.md');
        expect(ports.reportIssue).toHaveBeenCalledWith({ kind: 'denied' }, 'private.md');
        expect(ports.confirm).not.toHaveBeenCalled();
        expect(ports.openTab).not.toHaveBeenCalled();
    });

    test('a read rejection is logged and never interpreted as a missing note', async () => {
        const failure = new Error('Read failed');
        const { ports, navigate } = setup({ read: jest.fn().mockRejectedValue(failure) });
        await navigate('note.md');
        expect(ports.log.error).toHaveBeenCalledWith('Failed to open link:', failure, 'path was:', 'note.md');
        expect(ports.create).not.toHaveBeenCalled();
    });

    const similarTree = [{ name: 'InnerSource.md', path: 'notes/InnerSource.md', type: 'file' }];
    const edit = { from: 3, to: 24, target: 'notes/Inner Source.md' };
    test('using a similar note rewrites only the reviewed destination and never creates a file', async () => {
        const { ports, navigate } = setup({ getTree: () => similarTree, read: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ mtime: 9 }) });
        await navigate(edit.target, 'Alias', false, edit);
        expect(ports.replaceTarget).toHaveBeenCalledWith(edit, 'notes/InnerSource.md');
        expect(ports.openTab).toHaveBeenCalledWith('notes/InnerSource.md', 'InnerSource.md', 'file', { path: 'notes/InnerSource.md', mtime: 9 });
        expect(ports.create).not.toHaveBeenCalled();
    });

    test.each([
        ['stale', { mtime: 9 }, false, 'Link changed'],
        ['unavailable', null, true, 'Couldn’t open existing note'],
    ])('a %s similar-note choice neither replaces nor creates another note', async (_name, existing, replaceResult, title) => {
        const { ports, navigate } = setup({
            getTree: () => similarTree, read: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing),
            replaceTarget: jest.fn(() => replaceResult),
        });
        await navigate(edit.target, 'Alias', false, edit);
        expect(ports.error.mock.calls[0][0]).toBe(title);
        expect(ports.create).not.toHaveBeenCalled();
        expect(ports.openTab).not.toHaveBeenCalled();
    });

    test('cancelling similar-note review does not offer a second creation prompt', async () => {
        const { ports, navigate } = setup({ getTree: () => similarTree, confirm: jest.fn().mockResolvedValue(false) });
        await navigate(edit.target, 'Alias', false, edit);
        expect(ports.confirm).toHaveBeenCalledTimes(1);
        expect(ports.create).not.toHaveBeenCalled();
    });

    test('explicit create-anyway from similar-note review creates once without a second prompt', async () => {
        const { ports, navigate } = setup({ getTree: () => similarTree, confirm: jest.fn().mockResolvedValue('extra') });
        await navigate(edit.target, 'Alias', false, edit);
        expect(ports.confirm).toHaveBeenCalledTimes(1);
        expect(ports.create).toHaveBeenCalledWith('notes/Inner Source.md', '# Inner Source\n\n');
    });
});
