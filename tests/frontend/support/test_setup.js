/**
 * Frontend Test Setup for figaro
 * Provides mocking utilities for testing JavaScript modules
 * Run in browser or with jsdom/Jest
 */

// codemirror-markdown-tables follows the editor's light/dark media state.
// jsdom does not provide matchMedia, while every supported desktop webview does.
if (typeof window.matchMedia !== 'function') {
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    }));
}
if (typeof window.ResizeObserver !== 'function') {
    window.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}
if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = () => [{
        top: 0, right: 8, bottom: 16, left: 0, width: 8, height: 16,
    }];
}
if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => ({
        top: 0, right: 8, bottom: 16, left: 0, width: 8, height: 16,
    });
}

// Mock native Wails App binding.
window.go = {
    main: {
        App: {
        GetFileTree: jest.fn().mockResolvedValue([]),
        GetFileTreeStyles: jest.fn().mockResolvedValue({ version: 1, entries: {}, recent_icons: [] }),
        SetFileTreeStyle: jest.fn().mockResolvedValue({ version: 1, entries: {}, recent_icons: [] }),
        ReadFile: jest.fn().mockResolvedValue({ content: "", mtime: Date.now() / 1000, path: "" }),
        SaveFile: jest.fn().mockResolvedValue({ success: true, mtime: Date.now() / 1000 }),
        SaveClipboardImage: jest.fn().mockResolvedValue({ success: true, path: 'image1.png', markdown: '![Image1](image1.png)' }),
        SaveSession: jest.fn().mockResolvedValue({ success: true }),
        LoadSession: jest.fn().mockResolvedValue({}),
        CreateFile: jest.fn().mockResolvedValue({ success: true, mtime: Date.now() / 1000 }),
        CreateInboxNote: jest.fn().mockResolvedValue({ success: true, path: 'Inbox/Quick-note.md', mtime: Date.now() / 1000 }),
        CreateStarterPrintStylesheet: jest.fn().mockResolvedValue({ success: true, path: "pdf.css", created: true }),
        CreateDirectory: jest.fn().mockResolvedValue({ success: true }),
        DeletePath: jest.fn().mockResolvedValue({ success: true }),
        RenamePath: jest.fn().mockResolvedValue({ success: true }),
        MovePath: jest.fn().mockResolvedValue({ success: true }),
        MergeDirectory: jest.fn().mockResolvedValue({ success: true }),
        CopyPath: jest.fn().mockResolvedValue({ success: true, path: '' }),
        CopyExternalPaths: jest.fn().mockResolvedValue({ success: true, paths: [] }),
        MergeExternalPaths: jest.fn().mockResolvedValue({ success: true, paths: [] }),
        SearchFiles: jest.fn().mockResolvedValue([]),
        SearchBacklinks: jest.fn().mockResolvedValue([]),
        SearchUnlinkedMentions: jest.fn().mockResolvedValue([]),
        LinkUnlinkedMention: jest.fn().mockResolvedValue({ success: true }),
        GetVaultHealth: jest.fn().mockResolvedValue({ broken_links: [], orphan_attachments: [], duplicate_names: [], invalid_frontmatter: [] }),
        GetCommitCount: jest.fn().mockResolvedValue(0),
        FileHasUncommittedChanges: jest.fn().mockResolvedValue(false),
        GetFileHistory: jest.fn().mockResolvedValue([]),
        GetFileVersion: jest.fn().mockResolvedValue(''),
        GetKanbanColumns: jest.fn().mockResolvedValue(["todo", "wip", "done"]),
        AddKanbanColumn: jest.fn().mockResolvedValue({ success: true, columns: ["todo", "wip", "done"] }),
        RenameKanbanColumn: jest.fn().mockResolvedValue({ success: true, columns: ["todo", "wip", "done"] }),
        DeleteKanbanColumn: jest.fn().mockResolvedValue({ success: true, columns: ["todo", "wip", "done"] }),
        GetKanbanBoard: jest.fn().mockResolvedValue({ todo: [], wip: [], done: [] }),
        GetHomeTasks: jest.fn().mockResolvedValue([]),
        UpdateTaskTag: jest.fn().mockResolvedValue({ success: true }),
        RemoveTagFromTask: jest.fn().mockResolvedValue({ success: true }),
        GetLinkedNotesForDate: jest.fn().mockResolvedValue([]),
        GetCalendarMonthData: jest.fn().mockResolvedValue({
            year: 2024,
            month: 1,
            days_with_notes: [],
            days_with_links: [],
            calendar: []
        }),
        SearchNotesByDate: jest.fn().mockResolvedValue([]),
        GetTodayLink: jest.fn().mockReturnValue("2024-01-15"),
        GetOSUsername: jest.fn().mockResolvedValue('Test User'),
        CodeFontSave: jest.fn().mockResolvedValue({ success: true }),
		ThemeLoad: jest.fn().mockResolvedValue({ theme: 'default', font: 'inter', codeFont: 'theme-mono' }),
		ThemeSave: jest.fn().mockResolvedValue({ success: true }),
		GetThemeCSS: jest.fn().mockResolvedValue({ css: '' }),
		GetThemes: jest.fn().mockResolvedValue({ themes: [{ id: 'default', name: 'Figaro Dark' }] }),
		VimLoad: jest.fn().mockResolvedValue({ enabled: false }),
		VimSave: jest.fn().mockResolvedValue({ success: true }),
		VimVisualRowsLoad: jest.fn().mockResolvedValue({ enabled: false }),
		VimVisualRowsSave: jest.fn().mockResolvedValue({ success: true }),
		LineNumbersLoad: jest.fn().mockResolvedValue({ enabled: false }),
		LineNumbersSave: jest.fn().mockResolvedValue({ success: true }),
		MarkdownLintLoad: jest.fn().mockResolvedValue({ enabled: true }),
		MarkdownLintSave: jest.fn().mockResolvedValue({ success: true }),
		SpellcheckLoad: jest.fn().mockResolvedValue({ enabled: true, language: 'en-US' }),
		SpellcheckSave: jest.fn().mockResolvedValue({ success: true }),
		AutoSaveLoad: jest.fn().mockResolvedValue(300),
		AutoSaveSave: jest.fn().mockResolvedValue({ success: true }),
		AutoCommitLoad: jest.fn().mockResolvedValue(true),
		AutoCommitSave: jest.fn().mockResolvedValue({ success: true }),
		CommitCurrentFile: jest.fn().mockResolvedValue(null),
		LinkStyleLoad: jest.fn().mockResolvedValue({ style: 'markdown' }),
		ChangeLinkStyle: jest.fn().mockResolvedValue({ success: true, style: 'markdown', updated_links: [] }),
        GetTomorrowLink: jest.fn().mockReturnValue("2024-01-16"),
        GetYesterdayLink: jest.fn().mockReturnValue("2024-01-14"),
        ExportPDF: jest.fn().mockResolvedValue({ success: true, path: '/tmp/document.pdf', engine: 'chromium' }),
        PDFBrowserLoad: jest.fn().mockResolvedValue({ success: true, path: '' }),
        PDFBrowserChoose: jest.fn().mockResolvedValue({ success: false, cancelled: true }),
        PDFBrowserClear: jest.fn().mockResolvedValue({ success: true }),
        WindowMinimize: jest.fn().mockResolvedValue(undefined),
        WindowMaximize: jest.fn().mockResolvedValue(undefined),
        WindowClose: jest.fn().mockResolvedValue(undefined),
        WindowCaptureState: jest.fn().mockResolvedValue(undefined),
        WindowGetSize: jest.fn().mockResolvedValue({ w: 1280, h: 800 }),
        WindowSetSize: jest.fn().mockResolvedValue(undefined),
        }
    }
};

// Mock DOM elements for testing
function createMockDOM() {
    // Create minimal DOM structure matching current index.html
    document.body.innerHTML = `
        <div id="app">
            <header class="top-bar">
                <div class="top-bar-left">
                    <button id="toggle-sidebar"></button>
                    <button id="topbar-home" class="app-home-btn"><span class="app-title">figaro</span></button>
                </div>
                <div class="top-bar-center" aria-hidden="true"></div>
                <div class="top-bar-right">
                    <button id="topbar-settings" class="icon-btn titlebar-settings-btn" aria-label="Open Settings"></button>
                    <button id="win-minimize"></button>
                    <button id="win-maximize"></button>
                    <button id="win-close"></button>
                </div>
            </header>
            <div class="main-container">
                <aside id="sidebar" class="sidebar">
                    <div class="sidebar-content">
                        <div id="sidebar-search" class="sidebar-search">
                            <div class="search-input-wrapper">
                                <input id="global-search-input" />
                                <span id="search-results-count"></span>
                            </div>
                            <div id="global-search-dropdown" class="search-dropdown"></div>
                        </div>
                        <button id="create-inbox-note" class="create-inbox-note quick-note-action" data-action="quick-note"><span>Quick note</span></button>
                        <div id="file-tree"></div>
                        <section id="sidebar-calendar-panel" class="sidebar-calendar-panel" aria-hidden="true">
                            <div class="calendar-toolbar">
                                <button id="cal-prev-month"></button>
                                <span id="cal-month-year"></span>
                                <button id="cal-next-month"></button>
                            </div>
                            <div id="calendar-grid"></div>
                            <div id="cal-linked-notes"></div>
                        </section>
                    </div>
                    <nav class="sidebar-tools" aria-label="Workspace tools">
                        <button id="sidebar-quick-note" class="sidebar-tool-btn sidebar-quick-note quick-note-action" data-action="quick-note"><span class="sidebar-tool-label">Quick note</span></button>
                        <button id="sidebar-calendar" class="sidebar-tool-btn" aria-controls="sidebar-calendar-panel" aria-expanded="false">
                            <span class="sidebar-tool-label">Calendar</span>
                        </button>
                        <button id="sidebar-kanban" class="sidebar-tool-btn">
                            <span class="sidebar-tool-label">Kanban</span>
                            <span id="kanban-badges" class="kanban-badges"></span>
                        </button>
                    </nav>
                    <div id="sidebar-resizer"></div>
                </aside>
                <main id="main-content" class="main-content">
                    <div id="tab-bar" class="tab-bar"><div id="tab-strip" class="tab-strip" role="tablist"></div><button id="all-tabs-btn"></button><div id="all-tabs-dropdown" class="all-tabs-dropdown hidden"></div></div>
                    <div id="tab-panels" class="tab-panels"></div>
                    <div id="editor-container"></div>
                </main>
                <aside id="right-sidebar" class="right-sidebar collapsed">
                    <div id="right-sidebar-resizer" class="sidebar-resizer right-sidebar-resizer" aria-label="Resize right pane"></div>
                    <div class="right-sidebar-header">
                        <span id="right-sidebar-title" class="right-sidebar-title">Details</span>
                        <button id="right-sidebar-close" class="right-sidebar-close">×</button>
                    </div>
                    <div id="right-sidebar-content" class="right-sidebar-content">
                        <div id="history-content" style="display:none"></div>
                    </div>
                </aside>
            </div>
            <footer id="status-bar" class="status-bar">
                <span id="status-text">Ready</span>
                <span id="cursor-position">Ln 1, Col 1</span>
                <span id="reading-time">0 min read</span>
                <span id="word-count">0 words</span>
                <span id="char-count">0 chars</span>
                <button id="outline-toggle" class="status-outline" aria-controls="right-sidebar" aria-expanded="false" hidden>Outline</button>
                <span id="outline-separator" class="status-separator" hidden>|</span>
                <a id="backlinks-status" class="status-backlinks">0 backlinks</a>
                <button id="git-status" class="status-git" hidden disabled>Save to history</button>
                <span id="git-status-separator" class="status-separator" hidden>|</span>
                <a id="history-count" class="status-history">0 changes</a>
                <span class="md-cheatsheet-wrapper">
                    <button id="md-cheatsheet-trigger" aria-expanded="false">md cheatsheet</button>
                    <div id="md-cheatsheet-popup"><button id="md-cheatsheet-close"></button></div>
                </span>
            </footer>
            <div id="modals-container"></div>
        </div>
    `;
}

// Mock localStorage
const mockLocalStorage = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value.toString(); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();

Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock confirm/prompt dialogs
window.confirmDialog = jest.fn().mockResolvedValue(true);
window.promptDialog = jest.fn().mockResolvedValue("test");

// Mock statusBar
window.statusBar = {
    set: jest.fn(),
    clear: jest.fn()
};

// Test utilities
export const testUtils = {
    createMockDOM,
    mockLocalStorage,
    
    // Wait for async operations
    waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    
    // Trigger event on element
    triggerEvent: (element, eventName, options = {}) => {
        const event = new Event(eventName, { bubbles: true, ...options });
        element.dispatchEvent(event);
    },
    
    // Create a mock file tree data
    createMockFileTree: () => [
        { name: "note1.md", path: "note1.md", type: "file", mtime: Date.now() / 1000 },
        { name: "folder", path: "folder", type: "directory", children: [
            { name: "note2.md", path: "folder/note2.md", type: "file", mtime: Date.now() / 1000 }
        ]}
    ],
    
    // Create mock kanban board data
    createMockKanbanBoard: () => ({
        todo: [
            { file: "note.md", file_name: "note.md", line: 1, text: "Task 1", tag: "todo" }
        ],
        wip: [],
        done: []
    }),
    
    // Create mock search results
    createMockSearchResults: () => [
        { path: "note1.md", name: "note1.md", matches: [{ line: 1, text: "test content" }], mtime: Date.now() / 1000 }
    ],
    
    // Create mock backlinks
    createMockBacklinks: () => [
        { path: "source.md", name: "source.md", line_num: 5, snippet: "Link to [target](target.md)", mtime: Date.now() / 1000 }
    ]
};

// Auto-setup for Jest
if (typeof beforeEach !== 'undefined') {
    beforeEach(() => {
        createMockDOM();
        mockLocalStorage.clear();
        jest.clearAllMocks();
    });
}

export default testUtils;
