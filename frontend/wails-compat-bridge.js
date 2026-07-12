/**
 * wails-compat-bridge.js
 *
 * Transparent compatibility bridge that maps legacy `window.pywebview.api.*`
 * async calls to the Wails v2 auto-generated Go bindings.
 *
 * The bridge:
 * 1. Creates window.pywebview and window.pywebview.api
 * 2. Maps legacy snake_case API names → Go method names (PascalCase)
 * 3. Provides window controls (min/max/close) for frameless mode
 * 4. Injects --wails-draggable CSS for native OS-level window drag
 */

(function () {
  'use strict';

  console.log('[bridge] wails-compat-bridge.js LOADED');

  // ── Create pywebview namespace ──────────────────────────────────────────
  if (!window.pywebview) {
    window.pywebview = {};
  }
  window.pywebview.api = {};

  // ── Status bar helper ───────────────────────────────────────────────────
  function setStatus(msg) {
    var el = document.getElementById('status-text');
    if (el) { el.textContent = msg; return; }
    setTimeout(function () {
      var el2 = document.getElementById('status-text');
      if (el2) { el2.textContent = msg; }
    }, 200);
  }

  // ── Wait for Wails Go runtime ───────────────────────────────────────────
  function waitForGo() {
    setStatus('Connecting to backend...');
    return new Promise(function (resolve) {
      var check = function() {
        if (window.go && window.go.main && window.go.main.App) {
          resolve(window.go.main.App);
          return true;
        }
        return false;
      };
      if (check()) return;
      var maxWait = 150;
      var tries = 0;
      var interval = setInterval(function () {
        tries++;
        if (check()) {
          clearInterval(interval);
        } else if (tries > maxWait) {
          clearInterval(interval);
          console.error('[bridge] Timed out. window.go:', !!window.go);
          setStatus('ERROR: Backend not connected');
          resolve(null);
        } else if (tries === 1 || tries % 30 === 0) {
          console.log('[bridge] waiting... window.go:', !!window.go);
        }
      }, 100);
    });
  }

  // ── Method name mapping: legacy snake_case → Go PascalCase ──────────────
  var methodMap = {
    'get_file_tree':               'GetFileTree',
    'read_file':                   'ReadFile',
    'read_diagram':                'ReadDiagram',
    'save_file':                   'SaveFile',
    'get_file_history':            'GetFileHistory',
    'get_file_version':            'GetFileVersion',
    'get_commit_count':            'GetCommitCount',
    'auto_save_load':              'AutoSaveLoad',
    'auto_save_save':              'AutoSaveSave',
    'auto_commit_load':            'AutoCommitLoad',
    'auto_commit_save':            'AutoCommitSave',
    'commit_all_files':            'CommitAllFiles',
    'commit_current_file':         'CommitCurrentFile',
    'create_file':                 'CreateFile',
    'create_starter_print_stylesheet': 'CreateStarterPrintStylesheet',
    'create_directory':            'CreateDirectory',
    'delete_path':                 'DeletePath',
    'rename_path':                 'RenamePath',
    'move_path':                   'MovePath',
    'search_files':                'SearchFiles',
    'search_backlinks':            'SearchBacklinks',
    'get_kanban_columns':          'GetKanbanColumns',
    'get_kanban_board':            'GetKanbanBoard',
    'set_column_color':            'SetColumnColor',
    'rename_kanban_column':        'RenameKanbanColumn',
    'delete_kanban_column':        'DeleteKanbanColumn',
    'update_task_tag':             'UpdateTaskTag',
    'remove_tag_from_task':        'RemoveTagFromTask',
    'get_calendar_month_data':     'GetCalendarMonthData',
    'get_linked_notes_for_date':   'GetLinkedNotesForDate',
    'get_today_link':              'GetTodayLink',
    'get_os_username':             'GetOSUsername',
    'get_tomorrow_link':           'GetTomorrowLink',
    'get_yesterday_link':          'GetYesterdayLink',
    'save_session':                'SaveSession',
    'load_session':                'LoadSession',
    'merge_notes':                 'MergeNotes',
    'normalize_links':             'NormalizeLinks',
    'reveal_in_explorer':          'RevealInExplorer',
    'get_themes':                  'GetThemes',
    'get_theme_css':               'GetThemeCSS',
    'theme_load':                  'ThemeLoad',
    'theme_save':                  'ThemeSave',
    'font_save':                   'FontSave',
    'code_font_save':              'CodeFontSave',
    'vim_load':                    'VimLoad',
    'vim_save':                    'VimSave',
    'export_pdf':                 'ExportPDF',
    'window_minimize':             'WindowMinimize',
    'window_maximize':             'WindowMaximize',
    'window_close':                'WindowClose',
    'window_start_resize':         'WindowStartResize',
  };

  // ── Build compat API ────────────────────────────────────────────────────
  function buildCompatAPI(goApp) {
    var api = {};
    Object.keys(methodMap).forEach(function (pyName) {
      var goName = methodMap[pyName];
      if (!goApp[goName]) {
        api[pyName] = function () {
          return Promise.reject(new Error('Backend method not available: ' + goName));
        };
        return;
      }
      api[pyName] = function () {
        var args = Array.prototype.slice.call(arguments);
        try {
          var result = goApp[goName].apply(goApp, args);
          if (result && typeof result.then === 'function') return result;
          return Promise.resolve(result);
        } catch (e) {
          return Promise.reject(e);
        }
      };
    });
    return api;
  }

  // ── Inject frameless CSS (--wails-draggable for native drag) ────────────
  function injectFramelessCSS() {
    var css = [
      'html, body { background: #151515; border-radius: 8px; overflow: hidden; }',
      'body { border: 1px solid rgba(255,255,255,0.08); box-sizing: border-box; }',
      '.top-bar { --wails-draggable: drag; user-select: none; -webkit-user-select: none; border-radius: 8px 8px 0 0; }',
      '.top-bar button, .top-bar input, .top-bar .search-container { --wails-draggable: no-drag; }',
      '.status-bar { border-radius: 0 0 8px 8px; padding-right: 2px; }',
      '.status-left { padding-left: 12px; }',
      '#resize-grip { cursor: nwse-resize; padding: 0 2px 0 6px; margin-right: -2px; opacity: 0.35; display: flex; align-items: center; }',
      '#resize-grip:hover { opacity: 0.8; }',
    ].join('\n');
    var s = document.createElement('style');
    s.id = 'wails-frameless';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Resize grip: drag to resize from bottom-right corner ───────────────
  function installResizeGrip(goApp) {
    var grip = document.getElementById('resize-grip');
    if (!grip) return;

    var resizing = false;
    var startX = 0, startY = 0, startW = 0, startH = 0;

    grip.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      startX = e.screenX;
      startY = e.screenY;

      if (goApp.WindowGetSize) {
        goApp.WindowGetSize().then(function (s) {
          startW = s.w || 800;
          startH = s.h || 600;
        }).catch(function () {});
      }
    });

    window.addEventListener('mousemove', function (e) {
      if (!resizing) return;
      var dw = e.screenX - startX;
      var dh = e.screenY - startY;
      if (goApp.WindowSetSize) {
        goApp.WindowSetSize(Math.max(800, startW + dw), Math.max(500, startH + dh));
      }
    });

    window.addEventListener('mouseup', function () {
      resizing = false;
    });
  }

  // Frameless windows do not receive a platform title bar automatically.
  // Match the expected desktop convention on the non-interactive part of our
  // custom top bar while leaving buttons, inputs, and links alone.
  function installTitleBarDoubleClick(goApp) {
    var topBar = document.querySelector('.top-bar');
    if (!topBar || topBar.dataset.wailsTitlebarToggleBound) return;
    topBar.dataset.wailsTitlebarToggleBound = 'true';

    topBar.addEventListener('dblclick', function (event) {
      if (event.target && event.target.closest && event.target.closest('button, input, textarea, select, a, [contenteditable="true"]')) {
        return;
      }
      event.preventDefault();
      try { goApp.WindowMaximize(); } catch (e) { console.error(e); }
    });
  }

  // ── Install bridge once Go bindings are ready ───────────────────────────
  waitForGo().then(function (goApp) {
    if (!goApp) {
      console.error('[bridge] Cannot install — Go bindings unavailable');
      return;
    }

    // Populate pywebview.api
    var compatAPI = buildCompatAPI(goApp);
    Object.keys(compatAPI).forEach(function (key) {
      window.pywebview.api[key] = compatAPI[key];
    });

    // Window controls for frameless buttons
    window.__wailsCompat = {
      windowMinimize: function () {
        try { goApp.WindowMinimize(); } catch(e) { console.error(e); }
      },
      windowMaximize: function () {
        try { goApp.WindowMaximize(); } catch(e) { console.error(e); }
      },
      windowClose: function () {
        try { goApp.WindowClose(); } catch(e) { console.error(e); }
      },
      windowStartResize: function (direction) {
        try { goApp.WindowStartResize(direction); } catch(e) { console.error(e); }
      }
    };

    // Inject --wails-draggable CSS for native window drag
    injectFramelessCSS();

    // Install resize-grip drag handler
    installResizeGrip(goApp);

    // Desktop-standard maximize/restore on a title-bar double click.
    installTitleBarDoubleClick(goApp);

    setStatus('Ready');

    console.log('[bridge] Installed — ' + Object.keys(compatAPI).length + ' methods bridged');
  });

})();
