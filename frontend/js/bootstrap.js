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
        get_file_tree: mock([{ name: 'Welcome.md', path: 'Welcome.md', type: 'file', mtime: 1 }]),
        get_file_tree_styles: mock({ version: 1, entries: {}, recent_icons: [] }),
        set_file_tree_style: mock({ version: 1, entries: {}, recent_icons: [] }),
        read_file: mock({ content: '# Welcome\n\nStart writing.', path: 'Welcome.md', mtime: 1 }),
        save_file: mock({ success: true }),
        save_clipboard_image: mock({ success: true, path: 'image1.png', markdown: '![Image1](image1.png)' }),
        create_file: mock({ success: true }),
        create_directory: mock({ success: true }),
        delete_path: mock({ success: true }),
        rename_path: mock({ success: true }),
        move_path: mock({ success: true }),
        merge_directory: mock({ success: true }),
        merge_external_paths: mock({ success: true, paths: [] }),
        search_files: mock([]),
        search_backlinks: mock([]),
        get_kanban_columns: mock({ columns: ['todo', 'wip', 'done'], colors: {} }),
        get_kanban_board: mock({ todo: [], wip: [], done: [] }),
        set_column_color: mock({ success: true }),
        rename_kanban_column: mock({ success: true }),
        delete_kanban_column: mock({ success: true }),
        update_task_tag: mock({ success: true }),
        remove_tag_from_task: mock({ success: true }),
        get_calendar_month_data: mock({ year: 2026, month: 7, days_with_notes: [], days_with_links: [], calendar: [] }),
        get_linked_notes_for_date: mock([]),
        get_today_link: mock('2026-07-09'),
        get_os_username: mock('Test User'),
        get_tomorrow_link: mock('2026-07-10'),
        get_yesterday_link: mock('2026-07-08'),
        save_session: mock({ success: true }),
        load_session: mock({}),
        merge_notes: mock({ success: true }),
        reveal_in_explorer: mock({ success: true }),
        get_themes: mock({ themes: [{ id: 'default', name: 'Figaro Dark' }] }),
        get_theme_css: mock({ css: '' }),
        theme_load: mock({ theme: 'default' }),
        theme_save: mock({ success: true }),
        vim_load: mock({ enabled: false }),
        vim_save: mock({ success: true }),
        link_style_load: mock({ style: 'markdown' }),
        change_link_style: mock({ success: true, style: 'markdown', updated_links: [] }),
        font_save: mock({ success: true }),
        code_font_save: mock({ success: true }),
        get_file_history: mock([]),
        get_file_version: mock(''),
        get_commit_count: mock(0),
        auto_save_load: mock(300),
        auto_save_save: mock({ success: true }),
        export_pdf: mock({ success: true, path: '/tmp/document.pdf', engine: 'chromium' }),
    };
}

export function bootWhenReady() {
    const api = window.pywebview?.api;
    // The bridge creates its namespace synchronously, then adds native methods
    // asynchronously. initApp already owns the method-level readiness wait.
    if (api) startApp();

    if (api?.get_file_tree) {
        return;
    }
    if (bootTries++ > 40 && !window.go?.main?.App) {
        console.warn('No Wails backend — running in debug mode');
        window.pywebview = window.pywebview || {};
        window.pywebview.api = Object.assign(window.pywebview.api || {}, debugAPI());
        startApp();
        return;
    }
    setTimeout(bootWhenReady, 50);
}

bootWhenReady();
