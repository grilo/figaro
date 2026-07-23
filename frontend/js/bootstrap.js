import { hasBackend, installDebugBackend } from './backend.js';
import { initApp } from './app.js';

let bootTries = 0;
let bootStarted = false;

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
        GetFileTreeStyles: mock({ version: 1, entries: {}, recent_icons: [] }),
        SetFileTreeStyle: mock({ version: 1, entries: {}, recent_icons: [] }),
        ReadFile: mock({ content: '# Welcome\n\nStart writing.', path: 'Welcome.md', mtime: 1 }),
        SaveFile: mock({ success: true }),
        SaveClipboardImage: mock({ success: true, path: 'image1.png', markdown: '![Image1](image1.png)' }),
        CreateFile: mock({ success: true }),
        CreateInboxNote: mock({ success: true, path: 'Inbox/Quick-note.md', mtime: 1 }),
        CreateDirectory: mock({ success: true }),
        DeletePath: mock({ success: true }),
        RenamePath: mock({ success: true }),
        MovePath: mock({ success: true }),
        MergeDirectory: mock({ success: true }),
        MergeExternalPaths: mock({ success: true, paths: [] }),
        SearchFiles: mock([]),
        SearchBacklinks: mock([]),
        SearchUnlinkedMentions: mock([]),
        LinkUnlinkedMention: mock({ success: true }),
        GetVaultHealth: mock({ broken_links: [], orphan_attachments: [], duplicate_names: [], invalid_frontmatter: [] }),
        GetKanbanColumns: mock({ columns: ['todo', 'wip', 'done'], colors: {} }),
        GetKanbanBoard: mock({ todo: [], wip: [], done: [] }),
        GetHomeTasks: mock([]),
        SetColumnColor: mock({ success: true }),
        RenameKanbanColumn: mock({ success: true }),
        DeleteKanbanColumn: mock({ success: true }),
        UpdateTaskTag: mock({ success: true }),
        RemoveTagFromTask: mock({ success: true }),
        GetCalendarMonthData: mock({ year: 2026, month: 7, days_with_notes: [], days_with_links: [], calendar: [] }),
        GetLinkedNotesForDate: mock([]),
        GetTodayLink: mock('2026-07-09'),
        GetOSUsername: mock('Test User'),
        GetTomorrowLink: mock('2026-07-10'),
        GetYesterdayLink: mock('2026-07-08'),
        SaveSession: mock({ success: true }),
        LoadSession: mock({}),
        MergeNotes: mock({ success: true }),
        RevealInExplorer: mock({ success: true }),
        GetThemes: mock({ themes: [{ id: 'default', name: 'Figaro Dark' }] }),
        GetThemeCSS: mock({ css: '' }),
        ThemeLoad: mock({ theme: 'default' }),
        ThemeSave: mock({ success: true }),
        VimLoad: mock({ enabled: false }),
        VimSave: mock({ success: true }),
        VimVisualRowsLoad: mock({ enabled: false }),
        VimVisualRowsSave: mock({ success: true }),
        LineNumbersLoad: mock({ enabled: false }),
        LineNumbersSave: mock({ success: true }),
        MarkdownLintLoad: mock({ enabled: true }),
        MarkdownLintSave: mock({ success: true }),
        SpellcheckLoad: mock({ enabled: true, language: 'en-US' }),
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
    };
}

export function bootWhenReady() {
    if (hasBackend()) {
        startApp();
        return;
    }
    if (bootTries++ > 40 && !window.go?.main?.App) {
        console.warn('No Wails backend — running in debug mode');
        installDebugBackend(debugAPI());
        startApp();
        return;
    }
    setTimeout(bootWhenReady, 50);
}

bootWhenReady();
