/**
 * Frontend Test Setup for figaro
 * Provides mocking utilities for testing JavaScript modules
 * Run in browser or with jsdom/Jest
 */

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
if (typeof window.CSS === 'undefined') window.CSS = {};
if (typeof window.CSS.escape !== 'function') {
    window.CSS.escape = value => String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
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
    desktop: {
        App: {
        GetFileTree: jest.fn().mockResolvedValue([]),
        GetVaultLoadStatus: jest.fn().mockResolvedValue({ generation: 1, phase: 'ready', loaded: 0, total: 0 }),
        GetFileTreeStyles: jest.fn().mockResolvedValue({ version: 1, entries: {}, recent_icons: [] }),
        SetFileTreeStyle: jest.fn().mockResolvedValue({ version: 1, entries: {}, recent_icons: [] }),
        SetFileTreePinned: jest.fn().mockResolvedValue({ version: 1, entries: {}, recent_icons: [] }),
        ReadFile: jest.fn().mockResolvedValue({ content: "", mtime: Date.now() / 1000, path: "" }),
        ReadDiagram: jest.fn().mockResolvedValue(null),
        SaveFile: jest.fn().mockResolvedValue({ success: true, mtime: Date.now() / 1000 }),
        SaveClipboardImage: jest.fn().mockResolvedValue({ success: true, path: 'image1.png', markdown: '![Image1](image1.png)' }),
        SaveSession: jest.fn().mockResolvedValue({ success: true }),
        LoadSession: jest.fn().mockResolvedValue({}),
        CreateFile: jest.fn().mockResolvedValue({ success: true, mtime: Date.now() / 1000 }),
        CreateInboxNote: jest.fn().mockResolvedValue({ success: true, path: 'Inbox/Quick-note.md', mtime: Date.now() / 1000 }),
        CreateStarterPrintStylesheet: jest.fn().mockResolvedValue({ success: true, path: "pdf.css", created: true }),
        CreateUpgradedPrintStylesheet: jest.fn().mockResolvedValue({ success: true, path: "pdf-v2.css", created: true }),
        CreateDirectory: jest.fn().mockResolvedValue({ success: true }),
        DeletePath: jest.fn().mockResolvedValue({ success: true }),
        GetRecentlyDeleted: jest.fn().mockResolvedValue([]),
        RestoreRecentlyDeleted: jest.fn().mockResolvedValue({ success: true }),
        RenamePath: jest.fn().mockResolvedValue({ success: true }),
        PreviewRenamePath: jest.fn().mockResolvedValue({ success: true, updated_links: [] }),
        RenamePathWithLinkUpdates: jest.fn().mockResolvedValue({ success: true }),
        MovePath: jest.fn().mockResolvedValue({ success: true }),
        MergeDirectory: jest.fn().mockResolvedValue({ success: true }),
        CopyPath: jest.fn().mockResolvedValue({ success: true, path: '' }),
        CopyExternalPaths: jest.fn().mockResolvedValue({ success: true, paths: [] }),
        MergeExternalPaths: jest.fn().mockResolvedValue({ success: true, paths: [] }),
        SearchFiles: jest.fn().mockResolvedValue([]),
        SearchNotes: jest.fn().mockResolvedValue({ results: [], suggestion: '' }),
        SearchBacklinks: jest.fn().mockResolvedValue([]),
        SearchUnlinkedMentions: jest.fn().mockResolvedValue([]),
        GetVaultGraph: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
        LinkUnlinkedMention: jest.fn().mockResolvedValue({ success: true }),
        GetVaultHealth: jest.fn().mockResolvedValue({ broken_links: [], orphan_attachments: [], duplicate_names: [], similar_notes: [], invalid_frontmatter: [] }),
        GetCommitCount: jest.fn().mockResolvedValue(0),
        FileHasUncommittedChanges: jest.fn().mockResolvedValue(false),
        GetFileHistory: jest.fn().mockResolvedValue([]),
        GetFileVersion: jest.fn().mockResolvedValue(''),
        GetKanbanColumns: jest.fn().mockResolvedValue(["todo", "wip", "done"]),
        RenameKanbanColumn: jest.fn().mockResolvedValue({ success: true, columns: ["todo", "wip", "done"] }),
        DeleteKanbanColumn: jest.fn().mockResolvedValue({ success: true, columns: ["todo", "wip", "done"] }),
        GetKanbanBoard: jest.fn().mockResolvedValue({ todo: [], wip: [], done: [] }),
        SetKanbanCardOrder: jest.fn().mockResolvedValue({ success: true }),
        GetHomeTasks: jest.fn().mockResolvedValue([]),
        GetDueTaskSummary: jest.fn().mockResolvedValue({ due_today: 0, overdue: 0 }),
        GetTasksDueOnDate: jest.fn().mockResolvedValue([]),
        UpdateTaskTag: jest.fn().mockResolvedValue({ success: true }),
        RemoveTagFromTask: jest.fn().mockResolvedValue({ success: true }),
        SetTaskDueDate: jest.fn().mockResolvedValue({ success: true }),
        GetLinkedNotesForDate: jest.fn().mockResolvedValue([]),
        GetCalendarTimelineData: jest.fn().mockResolvedValue({ start_date: '', end_date: '', days: [] }),
        GetCalendarMonthData: jest.fn().mockResolvedValue({
            year: 2024,
            month: 1,
            days_with_notes: [],
            days_with_links: [],
            days_with_due_tasks: [],
            day_summaries: [],
            calendar: []
        }),
        GetTodayLink: jest.fn().mockReturnValue("2024-01-15"),
        GetOSUsername: jest.fn().mockResolvedValue('Test User'),
        GetApplicationVersion: jest.fn().mockResolvedValue('Test build'),
        CodeFontSave: jest.fn().mockResolvedValue({ success: true }),
		ThemeLoad: jest.fn().mockResolvedValue({ theme: 'default', font: 'inter', codeFont: 'theme-mono' }),
		ThemeSave: jest.fn().mockResolvedValue({ success: true }),
		GetThemeCSS: jest.fn().mockResolvedValue({ css: '' }),
		GetThemes: jest.fn().mockResolvedValue({ themes: [{ id: 'default', name: 'Figaro Dark' }] }),
		VimLoad: jest.fn().mockResolvedValue({ enabled: false }),
		VimSave: jest.fn().mockResolvedValue({ success: true }),
		VimVisualRowsLoad: jest.fn().mockResolvedValue({ enabled: false }),
		VimVisualRowsSave: jest.fn().mockResolvedValue({ success: true }),
		VimRevealBlocksLoad: jest.fn().mockResolvedValue({ enabled: false }),
		VimRevealBlocksSave: jest.fn().mockResolvedValue({ success: true }),
		TabSizeLoad: jest.fn().mockResolvedValue({ size: 4 }),
		TabSizeSave: jest.fn().mockResolvedValue({ success: true }),
		LineNumbersLoad: jest.fn().mockResolvedValue({ enabled: false }),
		LineNumbersSave: jest.fn().mockResolvedValue({ success: true }),
		MarkdownLintLoad: jest.fn().mockResolvedValue({ enabled: true }),
		MarkdownLintSave: jest.fn().mockResolvedValue({ success: true }),
		EditorNavigationLoad: jest.fn().mockResolvedValue({ stickyHeadings: true, blockGuides: true, documentOutline: true }),
		EditorNavigationSave: jest.fn().mockResolvedValue({ success: true }),
		SpellcheckLoad: jest.fn().mockResolvedValue({ enabled: false, language: 'en-US' }),
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
        OpenWithDefaultApplication: jest.fn().mockResolvedValue({ success: true }),
        PDFBrowserLoad: jest.fn().mockResolvedValue({ success: true, path: '' }),
        PDFBrowserChoose: jest.fn().mockResolvedValue({ success: false, cancelled: true }),
        PDFBrowserClear: jest.fn().mockResolvedValue({ success: true }),
        WindowMinimize: jest.fn().mockResolvedValue(undefined),
        WindowMaximize: jest.fn().mockResolvedValue(undefined),
        WindowClose: jest.fn().mockResolvedValue(undefined),
        WindowCaptureState: jest.fn().mockResolvedValue(undefined),
        WindowGetSize: jest.fn().mockResolvedValue({ w: 1280, h: 800 }),
        WindowSetSize: jest.fn().mockResolvedValue(undefined),
        WindowSetTitle: jest.fn().mockResolvedValue(undefined),
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
                <div class="top-bar-center">
                    <div id="tab-bar" class="ui-document-tabs ui-document-tabs--titlebar tab-bar">
                        <div id="tab-strip" class="tab-strip" role="tablist" aria-label="Open notes"></div>
                        <button id="all-tabs-btn" aria-label="Show all open tabs" aria-controls="all-tabs-dropdown" aria-haspopup="menu" aria-expanded="false" hidden></button>
                        <div id="all-tabs-dropdown" class="all-tabs-dropdown hidden" role="menu" aria-label="All open tabs"></div>
                    </div>
                </div>
                <div class="top-bar-right">
                    <span class="md-cheatsheet-wrapper topbar-cheatsheet">
                        <button id="md-cheatsheet-trigger" title="Figaro help (F1)" aria-label="Open Figaro help" aria-expanded="false" aria-controls="md-cheatsheet-popup">?</button>
                        <div id="md-cheatsheet-popup" role="dialog" aria-label="Figaro help" hidden>
                            <div role="tablist" aria-label="Help topics">
                                <button id="md-help-markdown-tab" role="tab" aria-selected="true" aria-controls="md-help-markdown-panel">Markdown</button>
                                <button id="md-help-macros-tab" role="tab" aria-selected="false" aria-controls="md-help-macros-panel" tabindex="-1">Macros</button>
                                <button id="md-help-shortcuts-tab" role="tab" aria-selected="false" aria-controls="md-help-shortcuts-panel" tabindex="-1">Shortcuts</button>
                            </div>
                            <button id="md-cheatsheet-close" aria-label="Close Figaro help"></button>
                            <div id="md-help-markdown-panel" role="tabpanel" aria-labelledby="md-help-markdown-tab" tabindex="-1"></div>
                            <div id="md-help-macros-panel" role="tabpanel" aria-labelledby="md-help-macros-tab" tabindex="-1" hidden></div>
                            <div id="md-help-shortcuts-panel" role="tabpanel" aria-labelledby="md-help-shortcuts-tab" tabindex="-1" hidden></div>
                        </div>
                    </span>
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
                                <input id="global-search-input" role="combobox" aria-label="Search notes" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="search-result-list" aria-expanded="false" />
                                <span id="search-results-count" aria-live="polite" aria-atomic="true" hidden></span>
                            </div>
                            <div id="global-search-dropdown" class="search-dropdown"></div>
                        </div>
                        <button id="create-inbox-note" class="create-inbox-note quick-note-action" data-action="quick-note"><span>Quick note</span></button>
                        <div id="file-tree"></div>
                    </div>
                    <nav class="sidebar-tools" aria-label="Workspace tools">
                        <button id="sidebar-quick-note" class="sidebar-tool-btn sidebar-quick-note quick-note-action" data-action="quick-note"><span class="sidebar-tool-label">Quick note</span></button>
                        <button id="sidebar-calendar" class="sidebar-tool-btn sidebar-workspace-tab ui-document-tab ui-document-tab--side-connected" aria-controls="tab-panels">
                            <span class="sidebar-tool-label">Calendar</span>
                        </button>
                        <button id="sidebar-kanban" class="sidebar-tool-btn sidebar-workspace-tab ui-document-tab ui-document-tab--side-connected" aria-controls="tab-panels">
                            <span class="sidebar-tool-label">Kanban</span>
                            <span id="kanban-badges" class="kanban-badges"></span>
                        </button>
                        <button id="sidebar-graph" class="sidebar-tool-btn sidebar-workspace-tab ui-document-tab ui-document-tab--side-connected" aria-controls="tab-panels">
                            <span class="sidebar-tool-label">Graph</span>
                        </button>
                    </nav>
                    <div id="sidebar-resizer" role="separator" tabindex="0" aria-label="Resize navigation pane" aria-controls="sidebar"></div>
                </aside>
                <main id="main-content" class="main-content">
                    <nav id="editor-breadcrumb" class="editor-breadcrumb" aria-label="Current document path" hidden></nav>
                    <div id="tab-panels" class="tab-panels">
                        <section id="calendar-workspace-view" class="calendar-workspace-view" aria-hidden="true">
                            <div class="ui-segmented-control ui-segmented-control--quiet calendar-presentation-choices" role="group" aria-label="Calendar presentation">
                                <button class="ui-button calendar-presentation-choice" data-calendar-presentation="month" aria-pressed="true">Month</button>
                                <button class="ui-button calendar-presentation-choice" data-calendar-presentation="timeline" aria-pressed="false">Timeline</button>
                            </div>
                            <div id="calendar-month-view" class="calendar-month-view">
                                <div class="calendar-main-pane">
                                    <div class="calendar-toolbar">
                                        <button id="cal-prev-month"></button>
                                        <span id="cal-month-year"></span>
                                        <button id="cal-next-month"></button>
                                    </div>
                                    <div id="calendar-grid"></div>
                                </div>
                                <div id="cal-linked-notes"></div>
                            </div>
                            <section id="calendar-timeline-view" class="calendar-timeline-view" aria-hidden="true" aria-busy="false" hidden>
                                <div class="calendar-timeline-toolbar">
                                    <span class="calendar-timeline-range"></span>
                                    <div class="calendar-timeline-actions">
                                        <button class="calendar-timeline-today">Today</button>
                                        <button class="calendar-timeline-earlier">‹</button>
                                        <button class="calendar-timeline-later">›</button>
                                    </div>
                                </div>
                                <div class="calendar-timeline-stage">
                                    <div class="calendar-timeline-scroll" tabindex="0" aria-label="Horizontally scrollable note timeline. Use Left and Right to scroll, or drag empty space to pan; approaching either edge preloads the adjacent week."><div class="calendar-timeline-track"></div></div>
                                    <p class="calendar-timeline-message" hidden></p>
                                </div>
                            </section>
                        </section>
                    </div>
                    <div id="editor-container">
                        <div class="editor-navigation-overlay">
                            <button id="outline-toggle" class="ui-icon-button editor-outline-launcher" aria-label="Show document outline" aria-controls="right-sidebar" aria-expanded="false" hidden></button>
                            <nav id="sticky-heading-stack" class="sticky-heading-stack" aria-label="Sticky heading hierarchy" hidden></nav>
                        </div>
                    </div>
                </main>
                <aside id="right-sidebar" class="right-sidebar collapsed" aria-hidden="true" inert>
                    <div id="right-sidebar-resizer" class="sidebar-resizer right-sidebar-resizer" role="separator" tabindex="0" aria-label="Resize details pane" aria-controls="right-sidebar"></div>
                    <div class="right-sidebar-header">
                        <span id="right-sidebar-title" class="right-sidebar-title">Details</span>
                        <button id="right-sidebar-close" class="right-sidebar-close">×</button>
                    </div>
                    <div id="right-sidebar-content" class="right-sidebar-content">
                        <div id="history-content" style="display:none"></div>
                    </div>
                </aside>
            </div>
            <footer id="status-bar" class="status-bar" data-writing-rest="false"
                    data-application-idle="false" data-editor-side-reveal="false"
                    data-editor-scale-reveal="false">
                <div class="status-left" role="group" aria-label="Application status"
                     data-application-active="false" data-has-action="false" title="Ready">
                    <span id="status-activity-spinner" class="ui-spinner" aria-hidden="true" hidden></span>
                    <div id="vault-loading-panel" class="status-vault-loading" aria-busy="true" hidden>
                        <span id="vault-loading-title"></span>
                        <span id="vault-loading-message"></span>
                        <span id="vault-loading-progress" class="ui-progress" role="progressbar"></span>
                        <span id="vault-loading-progress-value" class="ui-progress-value"></span>
                        <output id="vault-loading-count"></output>
                    </div>
                    <span id="status-text" role="status" aria-live="polite" aria-atomic="true" title="Ready">Ready</span>
                    <button id="status-action" hidden></button>
                </div>
                <div class="status-right" role="group" aria-label="Active buffer status" data-writing-summary="0 words" data-mode="buffer">
                    <div id="graph-status-content" class="graph-status-content">
                        <span id="graph-status-count">Loading graph…</span>
                        <span class="status-separator">|</span>
                    <span class="graph-status-instruction">Hover or click to trace links, ctrl+click node to open the file</span>
                        <span id="graph-status-selection" class="graph-status-selection" role="status" aria-live="polite">No note selected</span>
                    </div>
                    <div class="status-buffer-left" role="group" aria-label="History, relationships, and editor state">
                        <button id="history-count" class="status-history" disabled>0 changes</button>
                        <span id="git-status-separator" class="status-separator" hidden>|</span>
                        <button id="git-status" class="status-git" hidden disabled>Save to history</button>
                        <span class="status-separator">|</span>
                        <button id="backlinks-status" class="status-backlinks" disabled>0 backlinks</button>
                        <span class="status-separator status-detail-extended">|</span>
                        <span id="file-type" class="status-detail-extended">Standard</span>
                        <span id="editor-scale-separator" class="status-separator" hidden>|</span>
                        <button id="editor-scale-status" class="status-history has-history status-scale" hidden>Scale 100%</button>
                        <span class="status-separator status-detail-extended">|</span>
                        <span id="file-encoding" class="status-detail-extended">UTF-8</span>
                    </div>
                    <div class="status-buffer-right" role="group" aria-label="Document metrics">
                        <span id="cursor-position">Ln 1, Col 1</span>
                        <span class="status-separator status-detail-word">|</span>
                        <span id="word-count" class="status-detail-word">0 words</span>
                        <span class="status-separator status-detail-extended">|</span>
                        <span id="char-count" class="status-detail-extended">0 chars</span>
                        <span class="status-separator status-detail-reading">|</span>
                        <span id="reading-time" class="status-detail-reading">0 min read</span>
                    </div>
                </div>
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
