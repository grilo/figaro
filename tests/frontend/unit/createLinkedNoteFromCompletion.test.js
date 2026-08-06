import { createLinkedNoteFromCompletion } from '../frontend/js/usecases/createLinkedNoteFromCompletion.js';

describe('linked-note autocomplete creation', () => {
    const plan = {
        label: 'A link',
        fileName: 'A link.md',
        parentDirectory: 'notes',
        path: 'notes/A link.md',
        content: '# A link\n\n',
    };

    test('creates first, then inserts the completed link and refreshes the tree', async () => {
        const effects = [];
        const result = await createLinkedNoteFromCompletion({
            tree: [],
            plan,
            reviewName: jest.fn(async options => {
                expect(options).toEqual(expect.objectContaining({
                    parentDirectory: 'notes',
                    proposedName: 'A link.md',
                    operation: 'create',
                }));
                return 'proceed';
            }),
            createFile: jest.fn(async (path, content) => {
                effects.push(`create:${path}:${content}`);
                return { success: true, path, mtime: 2 };
            }),
            applyLink: jest.fn(async path => { effects.push(`apply:${path}`); return true; }),
            refreshTree: jest.fn(async () => { effects.push('refresh'); }),
            openExisting: jest.fn(),
        });

        expect(result).toEqual({ kind: 'created', path: 'notes/A link.md' });
        expect(effects).toEqual([
            'create:notes/A link.md:# A link\n\n',
            'apply:notes/A link.md',
            'refresh',
        ]);
    });

    test('leaves editor and tree untouched when creation fails or review is cancelled', async () => {
        const applyLink = jest.fn();
        const refreshTree = jest.fn();
        const createFile = jest.fn().mockResolvedValue({ success: false, error: 'disk full' });
        await expect(createLinkedNoteFromCompletion({
            tree: [], plan,
            reviewName: jest.fn().mockResolvedValue('proceed'),
            createFile,
            applyLink,
            refreshTree,
            openExisting: jest.fn(),
        })).resolves.toEqual({ kind: 'failed', error: 'disk full' });
        expect(applyLink).not.toHaveBeenCalled();
        expect(refreshTree).not.toHaveBeenCalled();

        createFile.mockClear();
        await expect(createLinkedNoteFromCompletion({
            tree: [], plan,
            reviewName: jest.fn().mockResolvedValue('cancelled'),
            createFile,
            applyLink,
            refreshTree,
            openExisting: jest.fn(),
        })).resolves.toEqual({ kind: 'cancelled' });
        expect(createFile).not.toHaveBeenCalled();
    });

    test('links and opens the reviewed existing note without creating a variant', async () => {
        const effects = [];
        const result = await createLinkedNoteFromCompletion({
            tree: [], plan,
            reviewName: jest.fn(async ({ open }) => {
                await open('notes/ALink.md');
                return 'opened';
            }),
            createFile: jest.fn(),
            applyLink: jest.fn(async path => { effects.push(`apply:${path}`); return true; }),
            refreshTree: jest.fn(),
            openExisting: jest.fn(async path => { effects.push(`open:${path}`); }),
        });

        expect(result).toEqual({ kind: 'used-existing' });
        expect(effects).toEqual(['apply:notes/ALink.md', 'open:notes/ALink.md']);
    });

    test('reports a stale editor range after creation without hiding the created note', async () => {
        await expect(createLinkedNoteFromCompletion({
            tree: [], plan,
            reviewName: jest.fn().mockResolvedValue('proceed'),
            createFile: jest.fn().mockResolvedValue({ success: true, path: plan.path }),
            applyLink: jest.fn().mockResolvedValue(false),
            refreshTree: jest.fn().mockResolvedValue(undefined),
            openExisting: jest.fn(),
        })).resolves.toEqual({ kind: 'created-stale', path: plan.path });
    });
});
