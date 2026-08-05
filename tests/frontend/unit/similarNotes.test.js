import { canonicalMarkdownName, planSameDirectoryNoteName } from '../frontend/js/core/similarNotes.js';

describe('similar note-name planning', () => {
    const tree = [
        {
            name: 'notes', path: 'notes', type: 'directory', children: [
                { name: 'InnerSource.md', path: 'notes/InnerSource.md', type: 'file' },
                { name: 'C++.md', path: 'notes/C++.md', type: 'file' },
            ],
        },
        {
            name: 'archive', path: 'archive', type: 'directory', children: [
                { name: 'Inner-Source.md', path: 'archive/Inner-Source.md', type: 'file' },
            ],
        },
    ];

    test('canonicalizes Unicode, case, whitespace, and punctuation for Markdown notes', () => {
        expect(canonicalMarkdownName('Notes/Ｉｎｎｅｒ Source!.MD')).toBe('innersource');
        expect(canonicalMarkdownName('Notes/readme.txt')).toBe('');
        expect(canonicalMarkdownName('Notes/C++.md')).toBe('');
    });

    test('finds a same-folder variant but does not interrupt on a different-folder match', () => {
        expect(planSameDirectoryNoteName({
            tree, parentDirectory: 'notes', proposedName: 'Inner Source.md',
        })).toEqual({ kind: 'similar', path: 'notes/InnerSource.md', name: 'InnerSource.md' });

        expect(planSameDirectoryNoteName({
            tree, parentDirectory: 'other', proposedName: 'Inner Source.md',
        })).toEqual({ kind: 'none' });
    });

    test('distinguishes exact names and excludes the note currently being renamed', () => {
        expect(planSameDirectoryNoteName({
            tree, parentDirectory: 'notes', proposedName: 'innersource.md',
        }).kind).toBe('exact');

        expect(planSameDirectoryNoteName({
            tree,
            parentDirectory: 'notes',
            proposedName: 'Inner Source.md',
            currentPath: 'notes/InnerSource.md',
        })).toEqual({ kind: 'none' });
    });
});
