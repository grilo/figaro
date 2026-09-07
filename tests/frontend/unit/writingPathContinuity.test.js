import { createWritingPathContinuity } from '../../../frontend/js/usecases/writingPathContinuity.js';
import { movedWritingPath } from '../../../frontend/js/core/writingPathModel.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('writing decisions and preferences pending across a rename save only under their current document path', async () => {
    const entry = { path: 'Folder/Note.md' }, first = deferred(), native = deferred(), paths = [];
    const continuity = createWritingPathContinuity({ remap: result => { entry.path = movedWritingPath(entry.path, result); } });
    const writing = continuity.access(entry, path => { paths.push(path); return first.promise; });
    const move = jest.fn(() => native.promise), moving = continuity.move(move);
    await tick(); expect(move).not.toHaveBeenCalled();
    const later = continuity.access(entry, path => paths.push(path));
    first.resolve(); await writing; await tick(); expect(move).toHaveBeenCalledTimes(1);
    expect(paths).toEqual(['Folder/Note.md']);
    native.resolve({ success: true, old_path: 'Folder', path: 'Moved' });
    await Promise.all([moving, later]);
    expect(paths).toEqual(['Folder/Note.md', 'Moved/Note.md']);
});

test('failed or cancelled writing path changes release pending saves at the original path and allow retry', async () => {
    const entry = { path: 'Note.md' }, native = deferred(), remap = jest.fn();
    const continuity = createWritingPathContinuity({ remap });
    const moving = continuity.move(() => native.promise); await tick();
    const saved = continuity.access(entry, path => path);
    const failed = expect(moving).rejects.toThrow('move failed'); native.reject(new Error('move failed'));
    await failed; expect(await saved).toBe('Note.md'); expect(remap).not.toHaveBeenCalled();
    await continuity.move(async () => ({ success: false })); expect(remap).not.toHaveBeenCalled();
    await continuity.move(async () => ({ success: true })); expect(remap).toHaveBeenCalledTimes(1);
});

test('writing path remapping prefers merge copy names, preserves unrelated prefixes and handles subfolders', () => {
    const result = { success: true, old_path: 'Notes', path: 'Archive/Notes', moved_paths: { 'Notes/A.md': 'Archive/Notes/A (copy).md', 'Notes/Sub': 'Archive/Notes/Sub (copy)' } };
    expect(['Notes/A.md', 'Notes/B.md', 'Notes/Sub/B.md', 'NotesExtra/A.md'].map(path => movedWritingPath(path, result)))
        .toEqual(['Archive/Notes/A (copy).md', 'Archive/Notes/B.md', 'Archive/Notes/Sub (copy)/B.md', 'NotesExtra/A.md']);
});
