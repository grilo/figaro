import { hasBackend, installDebugBackend } from './backend.js';
import { initApp } from './app.js';
import { startupBackendDecision } from './core/bootstrapModel.js';
import { initTooltips } from './tooltip.js';

let bootTries = 0;
let bootStarted = false;

initTooltips();

function startApp() {
    if (bootStarted) return;
    bootStarted = true;
    window._appBootStarted = true;
    Promise.resolve(initApp()).catch((error) => {
        window._appInitError = String(error?.stack || error?.message || error);
        console.error('Figaro startup failed:', error);
        const status = document.getElementById('status-text');
        if (status) status.textContent = `Startup failed: ${error?.message || error}`;
    });
}

function debugAPI() {
    const mock = (value) => () => Promise.resolve(value);
    return {
        GetFileTree: mock([{ name: 'Welcome.md', path: 'Welcome.md', type: 'file', mtime: 1 }]),
        StartVaultLoad: mock(true),
        GetVaultLoadStatus: mock({ generation: 1, phase: 'ready', loaded: 1, total: 1 }),
        GetFileTreeStyles: mock({ version: 1, entries: {}, recent_icons: [] }),
        SetFileTreeStyle: mock({ version: 1, entries: {}, recent_icons: [] }),
        SetFileTreePinned: mock({ version: 1, entries: {}, recent_icons: [] }),
        ReadFile: mock({ content: '# Welcome\n\nStart writing.', path: 'Welcome.md', mtime: 1 }),
        SaveFile: mock({ success: true }),
        SaveClipboardImage: mock({ success: true, path: 'image1.png', markdown: '![Image1](image1.png)' }),
        CreateFile: mock({ success: true }),
        CreateInboxNote: mock({ success: true, path: 'Inbox/Quick-note.md', mtime: 1 }),
        CreateDirectory: mock({ success: true }),
        DeletePath: mock({ success: true }),
        GetRecentlyDeleted: mock([]),
        RestoreRecentlyDeleted: mock({ success: true }),
        RenamePath: mock({ success: true }),
        MovePath: mock({ success: true }),
        MergeDirectory: mock({ success: true }),
        MergeExternalPaths: mock({ success: true, paths: [] }),
        SearchFiles: mock([]),
        SearchNotes: mock({ results: [], suggestion: '' }),
        SearchBacklinks: mock([]),
        SearchUnlinkedMentions: mock([]),
        LinkUnlinkedMention: mock({ success: true }),
        GetVaultHealth: mock({ broken_links: [], orphan_attachments: [], duplicate_names: [], similar_notes: [], invalid_frontmatter: [] }),
        GetKanbanColumns: mock({ columns: ['todo', 'wip', 'done'], colors: {} }),
        GetKanbanBoard: mock({ todo: [], wip: [], done: [] }),
        SetKanbanCardOrder: mock({ success: true }),
        GetHomeTasks: mock([]),
        GetDueTaskSummary: mock({ due_today: 0, overdue: 0 }),
        GetTasksDueOnDate: mock([]),
        SetColumnColor: mock({ success: true }),
        RenameKanbanColumn: mock({ success: true }),
        DeleteKanbanColumn: mock({ success: true }),
        UpdateTaskTag: mock({ success: true }),
        RemoveTagFromTask: mock({ success: true }),
        SetTaskDueDate: mock({ success: true }),
        GetCalendarMonthData: mock({ year: 2026, month: 7, days_with_notes: [], days_with_links: [], days_with_due_tasks: [], day_summaries: [], calendar: [] }),
        GetLinkedNotesForDate: mock([]),
        GetTodayLink: mock('2026-07-09'),
        GetOSUsername: mock('Test User'),
        GetApplicationVersion: mock('Development build'),
        GetTomorrowLink: mock('2026-07-10'),
        GetYesterdayLink: mock('2026-07-08'),
        SaveSession: mock({ success: true }),
        LoadSession: mock({}),
        MergeNotes: mock({ success: true }),
        RevealInExplorer: mock({ success: true }),
        OpenWithDefaultApplication: mock({ success: true }),
        GetThemes: mock({ themes: [{ id: 'default', name: 'Figaro Dark' }] }),
        GetThemeCSS: mock({ css: '' }),
        ThemeLoad: mock({ theme: 'default' }),
        ThemeSave: mock({ success: true }),
        VimLoad: mock({ enabled: false }),
        VimSave: mock({ success: true }),
        VimVisualRowsLoad: mock({ enabled: false }),
        VimVisualRowsSave: mock({ success: true }),
        VimRevealBlocksLoad: mock({ enabled: false }),
        VimRevealBlocksSave: mock({ success: true }),
        TabSizeLoad: mock({ size: 4 }),
        TabSizeSave: mock({ success: true }),
        LineNumbersLoad: mock({ enabled: false }),
        LineNumbersSave: mock({ success: true }),
        MarkdownLintLoad: mock({ enabled: true }),
        MarkdownLintSave: mock({ success: true }),
        EditorNavigationLoad: mock({ stickyHeadings: true, blockGuides: true, documentOutline: true }),
        EditorNavigationSave: mock({ success: true }),
        SpellcheckLoad: mock({ enabled: false, language: 'en-US' }),
        SpellcheckSave: mock({ success: true }),
        LinkStyleLoad: mock({ style: 'markdown' }),
        ChangeLinkStyle: mock({ success: true, style: 'markdown', updated_links: [] }),
        FontSave: mock({ success: true }),
        CodeFontSave: mock({ success: true }),
        GetFileHistory: mock([]),
        GetFileVersion: mock(''),
        GetCommitCount: mock(0),
        FileHasUncommittedChanges: mock(false),
        AutoSaveLoad: mock(300),
        AutoSaveSave: mock({ success: true }),
        AutoCommitLoad: mock(true),
        AutoCommitSave: mock({ success: true }),
        CommitCurrentFile: mock(null),
        ExportPDF: mock({ success: true, path: '/tmp/document.pdf', engine: 'chromium' }),
        WindowSetTitle: mock(undefined),
    };
}

export function bootWhenReady() {
    const decision = startupBackendDecision({
        hasBackend: hasBackend(),
        protocol: window.location.protocol,
        tries: bootTries++,
    });
    if (decision === 'start') {
        startApp();
        return;
    }
    if (decision === 'debug') {
        console.warn('No Wails backend — running in debug mode');
        installDebugBackend(debugAPI());
        startApp();
        return;
    }
    setTimeout(bootWhenReady, 50);
}

bootWhenReady();
