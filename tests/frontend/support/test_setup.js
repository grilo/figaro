/**
 * Frontend Test Setup for figaro
 * Provides mocking utilities for testing JavaScript modules
 * Run in browser or with jsdom/Jest
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const NATIVE_EFFECT_METHODS = new Set([
    'SetFileTreeStyle', 'SetFileTreePinned', 'SaveFile', 'SaveClipboardImage', 'SaveSession',
    'CreateFile', 'CreateInboxNote', 'CreateStarterPrintStylesheet', 'CreateUpgradedPrintStylesheet',
    'CreateDirectory', 'DeletePath', 'RestoreRecentlyDeleted', 'RenamePath', 'RenamePathWithLinkUpdates',
    'MovePath', 'MergeDirectory', 'CopyPath', 'CopyExternalPaths', 'MergeExternalPaths',
    'LinkUnlinkedMention', 'RenameKanbanColumn', 'DeleteKanbanColumn', 'SetTaskSchedule',
    'SetKanbanCardOrder', 'UpdateTaskTag', 'RemoveTagFromTask', 'SetTaskDueDate', 'CodeFontSave',
    'ThemeSave', 'VimSave', 'VimVisualRowsSave', 'VimRevealBlocksSave', 'TabSizeSave',
    'LineNumbersSave', 'MarkdownLintSave', 'EditorNavigationSave', 'SpellcheckSave', 'AutoSaveSave',
    'AutoCommitSave', 'CommitCurrentFile', 'ChangeLinkStyle', 'ExportPDF', 'OpenWithDefaultApplication',
    'OpenLaunchExternalFile', 'RevealLaunchExternalFile', 'RevealInExplorer', 'PDFBrowserChoose',
    'PDFBrowserClear', 'WindowMinimize', 'WindowMaximize', 'WindowClose', 'WindowCaptureState',
    'WindowSetSize', 'WindowSetTitle',
]);

function requireExplicitNativeEffect(name, mock) {
    let configured = false;
    mock.mockImplementation(() => {
        throw new Error(`Native test effect must be configured explicitly before use: ${name}`);
    });
    for (const method of [
        'mockImplementation', 'mockImplementationOnce', 'mockResolvedValue', 'mockResolvedValueOnce',
        'mockRejectedValue', 'mockRejectedValueOnce', 'mockReturnValue', 'mockReturnValueOnce',
    ]) {
        const configure = mock[method].bind(mock);
        mock[method] = (...args) => {
            configured = true;
            return configure(...args);
        };
    }
    Object.defineProperties(mock, {
        _figaroNativeEffect: { value: name },
        _figaroNativeEffectConfigured: { get: () => configured },
    });
}

export function createNativeAppMock() {
    const app = {
        GetFileTree: jest.fn().mockResolvedValue([]),
        GetVaultFileIssues: jest.fn().mockResolvedValue([]),
        RecheckVaultFileIssues: jest.fn().mockResolvedValue([]),
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
        GetTaskSchedules: jest.fn().mockResolvedValue([]),
        SetTaskSchedule: jest.fn().mockResolvedValue(null),
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
        OpenLaunchExternalFile: jest.fn().mockResolvedValue({ success: true }),
        RevealLaunchExternalFile: jest.fn().mockResolvedValue({ success: true }),
        RevealInExplorer: jest.fn().mockResolvedValue({ success: true }),
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
    };
    for (const name of NATIVE_EFFECT_METHODS) {
        if (typeof app[name] === 'function') requireExplicitNativeEffect(name, app[name]);
    }
    return app;
}

let defaultNativeApp = createNativeAppMock();
let defaultNativeBinding = { desktop: { App: defaultNativeApp } };
let suiteNativeBinding;
window.go = defaultNativeBinding;

const applicationHTML = readFileSync(resolve('frontend/index.html'), 'utf8');
const applicationDocument = new DOMParser().parseFromString(applicationHTML, 'text/html');
const applicationBodyTemplate = document.createElement('template');
applicationBodyTemplate.innerHTML = applicationDocument.body.innerHTML;

// Use the production shell as the component-test fixture so changes to ids,
// roles, nesting, or default attributes cannot drift into a parallel test DOM.
function createMockDOM() {
    document.body.replaceChildren(applicationBodyTemplate.content.cloneNode(true));
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
    createNativeAppMock,
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
        if (suiteNativeBinding === undefined) {
            suiteNativeBinding = window.go === defaultNativeBinding ? null : window.go;
        }
        if (suiteNativeBinding) {
            window.go = suiteNativeBinding;
        } else {
            defaultNativeApp = createNativeAppMock();
            defaultNativeBinding = { desktop: { App: defaultNativeApp } };
            window.go = defaultNativeBinding;
        }
        createMockDOM();
        mockLocalStorage.clear();
        jest.clearAllMocks();
    });

    afterEach(() => {
        const unconfigured = Object.values(defaultNativeApp)
            .filter(mock => mock?._figaroNativeEffect
                && mock.mock.calls.length > 0
                && !mock._figaroNativeEffectConfigured)
            .map(mock => mock._figaroNativeEffect);
        if (unconfigured.length) {
            throw new Error(`Native test effects must be configured explicitly: ${unconfigured.join(', ')}`);
        }
    });
}

export default testUtils;
