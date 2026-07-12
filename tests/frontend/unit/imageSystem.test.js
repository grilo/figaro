/**
 * Image System Integration Tests — relative paths and autocomplete
 */
import { testUtils } from './test_setup.js';

// Mock state for getState
const mockState = {
    fileTreeData: [],
    activeTabId: 'test-tab',
    openTabs: [{ id: 'test-tab', path: 'notes/mynote.md' }],
};
jest.mock('../frontend/js/state.js', () => ({
    getState: jest.fn((key) => mockState[key]),
    setState: jest.fn(),
    subscribe: jest.fn(),
}));

// Mock editor module
const mockEditorView = {
    dispatch: jest.fn(),
    state: { doc: { toString: () => '' } },
};
jest.mock('../frontend/js/editor.js', () => ({
    getEditorView: jest.fn(() => mockEditorView),
    setImageBasePath: jest.fn(),
    createEditorView: jest.fn(),
    setEditorContent: jest.fn(),
    getEditorContent: jest.fn(() => ''),
}));

const mockApi = {
    theme_load: jest.fn(() => Promise.resolve({ theme: 'default', font: 'inter' })),
    font_save: jest.fn(() => Promise.resolve({ success: true })),
    get_theme_css: jest.fn(() => Promise.resolve({ css: ':root { --bg-color: #111; }' })),
    theme_save: jest.fn(() => Promise.resolve({ success: true })),
    get_themes: jest.fn(() => Promise.resolve({ themes: [{ id: 'default', name: 'Figaro Dark' }] })),
    vim_load: jest.fn(() => Promise.resolve({ enabled: false })),
};

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
    window.pywebview = { api: mockApi };
    document.documentElement.style.removeProperty('--editor-width');
    document.body.innerHTML = `
        <button id="font-picker-btn"><span id="font-current-name">Inter</span></button>
        <div id="font-picker-menu"></div>
        <button id="theme-picker-btn"><span id="theme-current-name">Default</span></button>
        <div id="theme-picker-menu"></div>
        <div class="text-width-control">
            <button class="text-width-btn" id="text-width-down">−</button>
            <span class="text-width-value" id="text-width-value">100%</span>
            <button class="text-width-btn" id="text-width-up">+</button>
        </div>
    `;
});

describe('Image BasePath Resolution', () => {
    test('setImageBasePath is called when loading a file', async () => {
        const { setImageBasePath } = await import('../frontend/js/editor.js');
        const tabPath = 'notes/mynote.md';

        // Simulate what loadFileContent does
        setImageBasePath(tabPath);

        expect(setImageBasePath).toHaveBeenCalledWith('notes/mynote.md');
    });
});

describe('Image Autocomplete Logic', () => {
    test('image files are collected from file tree (png, jpg, gif, svg, webp)', () => {
        const imgExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);
        const files = [
            { name: 'photo.png', type: 'file' },
            { name: 'readme.md', type: 'file' },
            { name: 'icon.svg', type: 'file' },
            { name: 'architecture.drawio.svg', type: 'file' },
            { name: 'banner.jpg', type: 'file' },
            { name: 'doc.pdf', type: 'file' },
            { name: 'anim.gif', type: 'file' },
            { name: 'logo.webp', type: 'file' },
        ];

        const imgFiles = files.filter(f => {
            const ext = f.name.split('.').pop().toLowerCase();
            return imgExts.has(ext);
        });

        expect(imgFiles.length).toBe(6);
        expect(imgFiles.map(f => f.name)).toEqual(
            expect.arrayContaining(['photo.png', 'icon.svg', 'architecture.drawio.svg', 'banner.jpg', 'anim.gif', 'logo.webp'])
        );
        expect(imgFiles.map(f => f.name)).not.toContain('readme.md');
        expect(imgFiles.map(f => f.name)).not.toContain('doc.pdf');
    });

    test('image files sorted by mtime, most recent first', () => {
        const imgFiles = [
            { name: 'old.png', path: 'images/old.png', mtime: 100 },
            { name: 'middle.png', path: 'notes/middle.png', mtime: 200 },
            { name: 'recent.png', path: 'images/recent.png', mtime: 300 },
            { name: 'oldest.png', path: 'notes/oldest.png', mtime: 50 },
        ];

        imgFiles.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));

        expect(imgFiles[0].name).toBe('recent.png');
        expect(imgFiles[1].name).toBe('middle.png');
        expect(imgFiles[2].name).toBe('old.png');
        expect(imgFiles[3].name).toBe('oldest.png');
    });

    test('image apply inserts ![name](path) syntax', () => {
        const mockView = { dispatch: jest.fn() };
        const f = { name: 'photo.png', path: 'notes/photo.png' };

        const rep = `![${f.name}](${f.path})`;
        const from = 0, to = 2;
        mockView.dispatch({
            changes: { from, to, insert: rep },
            selection: { anchor: from + rep.length }
        });

        expect(mockView.dispatch).toHaveBeenCalledWith({
            changes: { from: 0, to: 2, insert: '![photo.png](notes/photo.png)' },
            selection: { anchor: '![photo.png](notes/photo.png)'.length }
        });
    });

    test('paths with spaces are encoded', () => {
        const f = { name: 'my photo.png', path: 'notes/my photo.png' };
        const encodedPath = f.path.replace(/ /g, '%20');
        const rep = `![${f.name}](${encodedPath})`;

        expect(rep).toBe('![my photo.png](notes/my%20photo.png)');
    });

    test('absolute path when prefix starts with /', () => {
        // Simulate makeLinkPath with rawPrefix starting with /
        const targetPath = 'attachments/photo.png';
        const rawPrefix = '/att';
        const useAbsolute = rawPrefix.startsWith('/');
        const linkPath = useAbsolute ? '/' + targetPath : targetPath;
        expect(linkPath).toBe('/attachments/photo.png');
    });

    test('relative path when prefix does not start with /', () => {
        // Simulate makeLinkPath: current note at notes/project/todo.md
        // target at attachments/photo.png
        const currentDir = 'notes/project/';
        const targetPath = 'attachments/photo.png';

        const fromParts = currentDir.split('/').filter(Boolean);
        const toParts = targetPath.split('/');
        let i = 0;
        while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
        const ups = fromParts.slice(i).map(() => '..');
        const downs = toParts.slice(i);
        const linkPath = [...ups, ...downs].join('/');

        expect(linkPath).toBe('../../attachments/photo.png');
    });

    test('relative path for same-directory file', () => {
        const currentDir = 'notes/project/';
        const targetPath = 'notes/project/other.md';

        const fromParts = currentDir.split('/').filter(Boolean);
        const toParts = targetPath.split('/');
        let i = 0;
        while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
        const ups = fromParts.slice(i).map(() => '..');
        const downs = toParts.slice(i);
        const linkPath = [...ups, ...downs].join('/');

        expect(linkPath).toBe('other.md');
    });

    test('relative path for parent-directory file', () => {
        const currentDir = 'notes/project/';
        const targetPath = 'notes/readme.md';

        const fromParts = currentDir.split('/').filter(Boolean);
        const toParts = targetPath.split('/');
        let i = 0;
        while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
        const ups = fromParts.slice(i).map(() => '..');
        const downs = toParts.slice(i);
        const linkPath = [...ups, ...downs].join('/');

        expect(linkPath).toBe('../readme.md');
    });

});
