import { openImportedExternalFileTabs } from '../frontend/js/fileTree.js';

describe('imported external file tabs', () => {
    const tree = [{
        type: 'directory',
        name: 'Imports',
        path: 'Imports',
        children: [{ type: 'file', name: 'draft.md', path: 'Imports/draft.md', mtime: 12 }],
    }];

    test('opens an imported file in a new active tab', () => {
        const open = jest.fn();

        expect(openImportedExternalFileTabs(['Imports/draft.md'], tree, open)).toBe(true);
        expect(open).toHaveBeenCalledWith('Imports/draft.md', 'draft.md', 'file', {
            path: 'Imports/draft.md',
            mtime: 12,
        });
    });

    test('keeps the current tab active after importing a directory', () => {
        const open = jest.fn();

        expect(openImportedExternalFileTabs(['Imports'], tree, open)).toBe(false);
        expect(open).not.toHaveBeenCalled();
    });
});
