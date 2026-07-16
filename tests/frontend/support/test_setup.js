/**
 * Frontend Test Setup for figaro
 * Provides mocking utilities for testing JavaScript modules
 * Run in browser or with jsdom/Jest
 */

// Mock pywebview API
window.pywebview = {
    api: {
        get_file_tree: jest.fn().mockResolvedValue([]),
        read_file: jest.fn().mockResolvedValue({ content: "", mtime: Date.now() / 1000, path: "" }),
        save_file: jest.fn().mockResolvedValue({ success: true, mtime: Date.now() / 1000 }),
        save_session: jest.fn().mockResolvedValue({ success: true }),
        load_session: jest.fn().mockResolvedValue({}),
        create_file: jest.fn().mockResolvedValue({ success: true, mtime: Date.now() / 1000 }),
        create_starter_print_stylesheet: jest.fn().mockResolvedValue({ success: true, path: "pdf.css", created: true }),
        create_directory: jest.fn().mockResolvedValue({ success: true }),
        delete_path: jest.fn().mockResolvedValue({ success: true }),
        rename_path: jest.fn().mockResolvedValue({ success: true }),
        move_path: jest.fn().mockResolvedValue({ success: true }),
        copy_path: jest.fn().mockResolvedValue({ success: true, path: '' }),
        copy_external_paths: jest.fn().mockResolvedValue({ success: true, paths: [] }),
        search_files: jest.fn().mockResolvedValue([]),
        search_backlinks: jest.fn().mockResolvedValue([]),
        get_commit_count: jest.fn().mockResolvedValue(0),
        get_file_history: jest.fn().mockResolvedValue([]),
        get_file_version: jest.fn().mockResolvedValue(''),
        get_kanban_columns: jest.fn().mockResolvedValue(["todo", "wip", "done"]),
        add_kanban_column: jest.fn().mockResolvedValue({ success: true, columns: ["todo", "wip", "done"] }),
        rename_kanban_column: jest.fn().mockResolvedValue({ success: true, columns: ["todo", "wip", "done"] }),
        delete_kanban_column: jest.fn().mockResolvedValue({ success: true, columns: ["todo", "wip", "done"] }),
        get_kanban_board: jest.fn().mockResolvedValue({ todo: [], wip: [], done: [] }),
        update_task_tag: jest.fn().mockResolvedValue({ success: true }),
        remove_tag_from_task: jest.fn().mockResolvedValue({ success: true }),
        get_linked_notes_for_date: jest.fn().mockResolvedValue([]),
        get_calendar_month_data: jest.fn().mockResolvedValue({
            year: 2024,
            month: 1,
            days_with_notes: [],
            days_with_links: [],
            calendar: []
        }),
        search_notes_by_date: jest.fn().mockResolvedValue([]),
        get_today_link: jest.fn().mockReturnValue("2024-01-15"),
        get_os_username: jest.fn().mockResolvedValue('Test User'),
        code_font_save: jest.fn().mockResolvedValue({ success: true }),
        get_tomorrow_link: jest.fn().mockReturnValue("2024-01-16"),
        get_yesterday_link: jest.fn().mockReturnValue("2024-01-14"),
        export_pdf: jest.fn().mockResolvedValue({ success: true, path: '/tmp/document.pdf', engine: 'chromium' }),
        pdf_browser_load: jest.fn().mockResolvedValue({ success: true, path: '' }),
        pdf_browser_choose: jest.fn().mockResolvedValue({ success: false, cancelled: true }),
        pdf_browser_clear: jest.fn().mockResolvedValue({ success: true }),
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
                    <button id="topbar-calendar" class="topbar-action-btn"><span>Calendar</span></button>
                    <button id="topbar-kanban" class="topbar-action-btn">
                        <span>Kanban</span>
                        <span id="kanban-badges" class="kanban-badges"></span>
                    </button>
                    <button id="topbar-settings" class="topbar-action-btn"><span>Settings</span></button>
                </div>
            </header>
            <div class="main-container">
                <aside id="sidebar" class="sidebar">
                    <div id="sidebar-search" class="sidebar-search">
                        <div class="search-input-wrapper">
                            <input id="global-search-input" />
                            <span id="search-results-count"></span>
                        </div>
                        <div id="global-search-dropdown" class="search-dropdown"></div>
                    </div>
                    <div id="file-tree"></div>
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
                        <span id="right-sidebar-title" class="right-sidebar-title">Calendar</span>
                        <button id="right-sidebar-close" class="right-sidebar-close">×</button>
                    </div>
                    <div id="right-sidebar-content" class="right-sidebar-content">
                        <span id="cal-month-year"></span>
                        <div id="calendar-grid"></div>
                        <div id="cal-linked-notes"></div>
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
                <a id="backlinks-status" class="status-backlinks">0 backlinks</a>
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
