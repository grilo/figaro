/**
 * Theme Engine - loads/applies CSS themes and fonts
 */

import { log } from './log.js';
let currentTheme = 'default';
let currentFont = 'inter';
let currentCodeFont = 'theme-mono';
let themeStyleEl = null;
let themeRequestId = 0;
let fontSaveQueue = Promise.resolve();
let codeFontSaveQueue = Promise.resolve();
let currentVimEnabled = false;
let persistedVimEnabled = false;
let vimPreferenceLoaded = false;
let vimPreferenceLoadPromise = null;
let vimPreferenceRevision = 0;
let vimSaveQueue = Promise.resolve();

function isActivePanel(root) {
    return root === document || (!!root && root.isConnected && !root._settingsPanelDisposed);
}

function findIn(root, selector) {
    return root && root.querySelector ? root.querySelector(selector) : null;
}

function closeMenuOnOutsideClick(root, menu) {
    const closeMenu = () => {
        if (!isActivePanel(root)) {
            document.removeEventListener('click', closeMenu);
            return;
        }
        menu.classList.remove('open');
    };
    document.addEventListener('click', closeMenu);
}

function ensureStyleEl() {
    if (!themeStyleEl) {
        themeStyleEl = document.getElementById('theme-style');
    }
    if (!themeStyleEl) {
        themeStyleEl = document.createElement('style');
        themeStyleEl.id = 'theme-style';
        document.head.appendChild(themeStyleEl);
    }
    return themeStyleEl;
}

export async function initTheme() {
    ensureStyleEl();
    initCheatsheet();
    const result = await window.pywebview.api.theme_load();
    const themeId = (result && result.theme) || 'default';
    const fontId = (result && result.font) || 'inter';
    const codeFontId = (result && result.codeFont) || 'theme-mono';
    await applyTheme(themeId);
    applyFont(fontId, true);
    applyCodeFont(codeFontId, true);
    await initVimPreference();
}

export async function applyTheme(themeId) {
    const requestId = ++themeRequestId;
    // Keep the picker in sync with the most recent choice while CSS loads.
    currentTheme = themeId;

    try {
        const result = await window.pywebview.api.get_theme_css(themeId);
        // A slower request for an earlier selection must not replace a newer theme.
        if (requestId !== themeRequestId) return false;
        if (result && result.css) {
            ensureStyleEl().textContent = result.css;
            return true;
        }
    } catch (e) {
        log.warn('Failed to load theme:', themeId, e);
    }
    return false;
}

export function getCurrentTheme() { return currentTheme; }
export function getCurrentFont() { return currentFont; }
export function getCurrentCodeFont() { return currentCodeFont; }

export async function getThemes() {
    try {
        const result = await withTimeout(
            window.pywebview.api.get_themes(),
            3000,
            'get_themes timed out'
        );
        if (result && result.themes) return result.themes;
    } catch (e) {
        log.warn('Failed to load theme list:', e);
    }
    return [{ id: 'default', name: 'Figaro Dark' }];
}

function withTimeout(promise, ms, msg) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
    ]);
}

function syncVimToggles(enabled) {
    document.querySelectorAll('#vim-toggle').forEach(toggle => {
        toggle.checked = enabled;
    });
}

async function applyVimPreference(enabled) {
    const { toggleVim } = await import('./editor.js');
    await toggleVim(enabled);
}

export function getVimPreference() { return currentVimEnabled; }

/** Load and apply the persisted Vim preference exactly once per application run. */
export async function initVimPreference() {
    if (vimPreferenceLoaded) return currentVimEnabled;
    if (vimPreferenceLoadPromise) return vimPreferenceLoadPromise;

    vimPreferenceLoadPromise = (async () => {
        try {
            const result = await window.pywebview.api.vim_load();
            currentVimEnabled = !!(result && result.enabled);
            persistedVimEnabled = currentVimEnabled;
            vimPreferenceLoaded = true;
            syncVimToggles(currentVimEnabled);
            await applyVimPreference(currentVimEnabled);
        } catch (error) {
            // Leave the preference reloadable so opening Settings can recover
            // from a transient startup bridge failure.
            vimPreferenceLoaded = false;
            log.warn('Could not load Vim preference:', error);
        } finally {
            vimPreferenceLoadPromise = null;
        }
        return currentVimEnabled;
    })();
    return vimPreferenceLoadPromise;
}

/** Apply a Vim choice immediately and keep the persisted setting in the same state. */
export async function setVimPreference(enabled) {
    if (!vimPreferenceLoaded) await initVimPreference();

    const requested = Boolean(enabled);
    const revision = ++vimPreferenceRevision;
    currentVimEnabled = requested;
    syncVimToggles(requested);

    try {
        await applyVimPreference(requested);
    } catch (error) {
        log.warn('Could not apply Vim preference:', error);
        if (revision === vimPreferenceRevision) {
            currentVimEnabled = persistedVimEnabled;
            syncVimToggles(currentVimEnabled);
            try { await applyVimPreference(currentVimEnabled); } catch (_) { /* original failure is logged above */ }
        }
        return false;
    }

    const saveAttempt = vimSaveQueue.then(async () => {
        const result = await window.pywebview.api.vim_save(requested);
        if (!result?.success) throw new Error(result?.error || 'Vim preference was not saved');
        persistedVimEnabled = requested;
        return true;
    });
    vimSaveQueue = saveAttempt.catch(() => {});

    try {
        await saveAttempt;
        return true;
    } catch (error) {
        log.warn('Could not save Vim preference:', error);
        // Only the latest choice may roll back the live editor. An older failed
        // request must not overwrite a newer toggle that is still queued.
        if (revision === vimPreferenceRevision) {
            currentVimEnabled = persistedVimEnabled;
            syncVimToggles(currentVimEnabled);
            try { await applyVimPreference(currentVimEnabled); } catch (_) { /* already logged above */ }
        }
        return false;
    }
}

export async function initSettingsPanel(root = document) {
    log.debug('[settings] initSettingsPanel started');
    try {
        const themes = await getThemes();
        if (!isActivePanel(root)) return;

        const btn = findIn(root, '#theme-picker-btn');
        const menu = findIn(root, '#theme-picker-menu');
        const nameEl = findIn(root, '#theme-current-name');
        if (!btn || !menu || !nameEl) {
            log.warn('[settings] Theme picker DOM elements not found — panel not open yet, skipping');
            return;
        }

        const current = getCurrentTheme();
        const currentTheme = themes.find(t => t.id === current) || themes[0];
        nameEl.textContent = currentTheme.name;

        menu.innerHTML = themes.map(t =>
            `<div class="theme-picker-item ${t.id === current ? 'active' : ''}" data-id="${t.id}">${t.name}</div>`
        ).join('');

        btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.theme-picker-item');
            if (!item) return;
            const id = item.dataset.id;
            const theme = themes.find(t => t.id === id);
            if (theme) nameEl.textContent = theme.name;
            menu.querySelectorAll('.theme-picker-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            menu.classList.remove('open');
            applyTheme(id).then(applied => {
                if (!applied || getCurrentTheme() !== id) return;
                try { window.pywebview.api.theme_save(id).catch(() => {}); } catch (_) { /* noop */ }
            });
        });
        closeMenuOnOutsideClick(root, menu);

        // Vim toggle
        const vimToggle = findIn(root, '#vim-toggle');
        if (vimToggle) {
            const enabled = await initVimPreference();
            if (!isActivePanel(root)) return;
            vimToggle.checked = enabled;
            vimToggle.addEventListener('change', async () => {
                const requested = vimToggle.checked;
                vimToggle.disabled = true;
                const saved = await setVimPreference(requested);
                if (!isActivePanel(root)) return;
                vimToggle.checked = getVimPreference();
                vimToggle.disabled = false;
                vimToggle.title = saved ? '' : 'Could not save Vim preference; the previous setting was restored.';
            });
        }

        initFontSize(root);
        initTextWidth(root);
        initAutoSave(root);
        await initPDFBrowserSetting(root);

        await initFontPicker(root);
        initCodeFontPicker(root);
    } catch (e) {
        log.error('[settings] initSettingsPanel crashed:', e);
    }
}

function browserPathLabel(path) {
    const normalized = String(path || '').replaceAll('\\', '/');
    return normalized.split('/').filter(Boolean).pop() || normalized;
}

/** Bind the optional PDF-browser override to the native executable chooser. */
export async function initPDFBrowserSetting(root = document) {
    const status = findIn(root, '#pdf-browser-status');
    const choose = findIn(root, '#pdf-browser-choose');
    const clear = findIn(root, '#pdf-browser-clear');
    if (!status || !choose || !clear) return;

    const render = (path = '', error = '') => {
        const configured = Boolean(path);
        status.dataset.kind = error ? 'error' : configured ? 'configured' : 'automatic';
        status.textContent = error || (configured
            ? `Using ${browserPathLabel(path)}. Automatic discovery remains available if it moves.`
            : 'Automatic detection (Chrome, Chromium, Edge, or Brave).');
        status.title = path || '';
        clear.hidden = !configured;
    };

    try {
        const result = await window.pywebview.api.pdf_browser_load();
        if (!isActivePanel(root)) return;
        render(result?.path || '', result?.success === false ? result.error : '');
    } catch (error) {
        if (!isActivePanel(root)) return;
        render('', error?.message || 'Could not load the browser preference.');
    }

    choose.addEventListener('click', async () => {
        choose.disabled = true;
        status.dataset.kind = 'checking';
        status.textContent = 'Checking the selected browser…';
        try {
            const result = await window.pywebview.api.pdf_browser_choose();
            if (!isActivePanel(root)) return;
            if (result?.cancelled) {
                const current = await window.pywebview.api.pdf_browser_load();
                if (isActivePanel(root)) render(current?.path || '');
            } else if (result?.success === false) {
                const current = await window.pywebview.api.pdf_browser_load();
                if (isActivePanel(root)) render(current?.path || '', result.error || 'The selected browser is not usable.');
            } else {
                render(result?.path || '');
            }
        } catch (error) {
            if (isActivePanel(root)) render('', error?.message || 'Could not choose the browser executable.');
        } finally {
            if (isActivePanel(root)) choose.disabled = false;
        }
    });

    clear.addEventListener('click', async () => {
        clear.disabled = true;
        try {
            const result = await window.pywebview.api.pdf_browser_clear();
            if (!isActivePanel(root)) return;
            render('', result?.success === false ? (result.error || 'Could not restore automatic detection.') : '');
        } catch (error) {
            if (isActivePanel(root)) render('', error?.message || 'Could not restore automatic detection.');
        } finally {
            if (isActivePanel(root)) clear.disabled = false;
        }
    });
}

function initCheatsheet() {
    const cheatsheetTrigger = document.getElementById('md-cheatsheet-trigger');
    const cheatsheetPopup = document.getElementById('md-cheatsheet-popup');
    const cheatsheetClose = document.getElementById('md-cheatsheet-close');
    const wrapper = cheatsheetTrigger?.closest('.md-cheatsheet-wrapper');
    if (!cheatsheetTrigger || !cheatsheetPopup || !wrapper || cheatsheetTrigger.dataset.initialized === 'true') return;

    cheatsheetTrigger.dataset.initialized = 'true';
    let closeTimer = null;

    const setOpen = (open) => {
        cheatsheetPopup.classList.toggle('open', open);
        cheatsheetTrigger.setAttribute('aria-expanded', String(open));
    };
    const cancelClose = () => {
        if (closeTimer) window.clearTimeout(closeTimer);
        closeTimer = null;
    };
    const open = () => {
        cancelClose();
        setOpen(true);
    };
    const closeAfterPointerLeaves = () => {
        cancelClose();
        closeTimer = window.setTimeout(() => {
            if (!wrapper.matches(':hover') && !wrapper.matches(':focus-within')) setOpen(false);
        }, 120);
    };

    wrapper.addEventListener('pointerenter', open);
    wrapper.addEventListener('pointerleave', closeAfterPointerLeaves);
    wrapper.addEventListener('focusin', open);
    wrapper.addEventListener('focusout', closeAfterPointerLeaves);
    cheatsheetTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        open();
    });
    cheatsheetTrigger.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        setOpen(false);
        cheatsheetTrigger.blur();
    });
    if (cheatsheetClose) {
        cheatsheetClose.addEventListener('click', (e) => {
            e.stopPropagation();
            cancelClose();
            setOpen(false);
            cheatsheetClose.blur();
        });
    }
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.md-cheatsheet-wrapper')) {
            cancelClose();
            setOpen(false);
        }
    });
}

const FONTS = [
    { id: 'inter', name: 'Inter', file: '/vendored/fonts/inter-latin.woff2' },
    { id: 'figtree', name: 'Figtree', file: '/fonts/figtree-400.woff2' },
    { id: 'atkinson-hyperlegible', name: 'Atkinson Hyperlegible', file: '/fonts/atkinson-hyperlegible-400.woff2' },
    { id: 'ibm-plex-sans', name: 'IBM Plex Sans', file: '/fonts/ibm-plex-sans-400.woff2' },
    { id: 'fira-sans', name: 'Fira Sans', file: '/fonts/fira-sans-400.woff2' },
    { id: 'eb-garamond', name: 'EB Garamond', file: '/fonts/eb-garamond-400.woff2' },
    { id: 'crimson-pro', name: 'Crimson Pro', file: '/fonts/crimson-pro-400.woff2' },
    { id: 'exo-2', name: 'Exo 2', file: '/fonts/exo-2-400.woff2' },
    { id: 'dancing-script', name: 'Dancing Script', file: '/fonts/dancing-script-400.woff2' },
    { id: 'overpass', name: 'Overpass', file: '/fonts/overpass-400.woff2' },
    { id: 'alegreya', name: 'Alegreya', file: '/fonts/alegreya-400.woff2' },
    { id: 'alegreya-sans', name: 'Alegreya Sans', file: '/fonts/alegreya-sans-400.woff2' },
    { id: 'jetbrains-mono', name: 'JetBrains Mono', file: '/fonts/jetbrains-mono-400.woff2' },
    { id: 'work-sans', name: 'Work Sans', file: '/fonts/work-sans-400.woff2' },
    { id: 'etbb', name: 'ETbb', file: '/fonts/etbb-400.woff2' },
    { id: 'reforma-1918', name: 'Reforma 1918', file: '/fonts/reforma-400.woff2' },
];

const CODE_FONTS = [
    { id: 'theme-mono', name: 'Theme default', family: 'var(--font-mono)' },
    { id: 'jetbrains-mono', name: 'JetBrains Mono', family: '\'JetBrains Mono\', var(--font-mono)' },
    { id: 'sf-mono', name: 'SF Mono', family: '\'SF Mono\', Menlo, var(--font-mono)' },
    { id: 'fira-code', name: 'Fira Code', family: '\'Fira Code\', \'Fira Mono\', var(--font-mono)' },
    { id: 'cascadia-code', name: 'Cascadia Code', family: '\'Cascadia Code\', Consolas, var(--font-mono)' },
    { id: 'consolas', name: 'Consolas', family: 'Consolas, \'Liberation Mono\', var(--font-mono)' },
    { id: 'menlo', name: 'Menlo', family: 'Menlo, Monaco, var(--font-mono)' },
];

function initFontPicker(root) {
    const btn = findIn(root, '#font-picker-btn');
    const menu = findIn(root, '#font-picker-menu');
    const nameEl = findIn(root, '#font-current-name');
    if (!btn || !menu || !nameEl) {
        log.warn('[font] Missing DOM elements for font picker');
        return;
    }

    // Probe which font files actually exist on disk
    return Promise.all(FONTS.map(async f => {
        try { const r = await fetch(f.file, { method: 'HEAD' }); return r.ok ? f : null; }
        catch (_) { return null; }
    })).then(available => {
        if (!isActivePanel(root)) return;

        const list = available.filter(Boolean);
        if (list.length === 0) list.push(...FONTS); // graceful degradation
        log.debug('[font] ' + list.length + ' of ' + FONTS.length + ' fonts available');

        menu.innerHTML = list.map(f =>
            `<div class="font-picker-item ${f.id === currentFont ? 'active' : ''}" data-id="${f.id}">${f.name}</div>`
        ).join('');

        const current = FONTS.find(f => f.id === currentFont) || FONTS[0];
        nameEl.textContent = current.name;

        btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.font-picker-item');
            if (!item) return;
            const id = item.dataset.id;
            const font = FONTS.find(f => f.id === id);
            if (font) {
                menu.querySelectorAll('.font-picker-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                applyFont(id, false, root);
            }
            menu.classList.remove('open');
        });
        closeMenuOnOutsideClick(root, menu);
    });
}

function initCodeFontPicker(root) {
    const btn = findIn(root, '#code-font-picker-btn');
    const menu = findIn(root, '#code-font-picker-menu');
    const nameEl = findIn(root, '#code-font-current-name');
    if (!btn || !menu || !nameEl) return;

    const current = CODE_FONTS.find(font => font.id === currentCodeFont) || CODE_FONTS[0];
    nameEl.textContent = current.name;
    menu.innerHTML = CODE_FONTS.map(font =>
        `<div class="code-font-picker-item ${font.id === currentCodeFont ? 'active' : ''}" data-id="${font.id}">${font.name}</div>`
    ).join('');

    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        menu.classList.toggle('open');
    });
    menu.addEventListener('click', (event) => {
        const item = event.target.closest('.code-font-picker-item');
        if (!item) return;
        applyCodeFont(item.dataset.id, false, root);
        menu.classList.remove('open');
    });
    closeMenuOnOutsideClick(root, menu);
}

function applyFont(fontId, initial, root = document) {
    try {
        const fonts = {
            'inter': '\'Inter\', var(--font-sans)',
            'figtree': '\'Figtree\', var(--font-sans)',
            'atkinson-hyperlegible': '\'Atkinson Hyperlegible\', var(--font-sans)',
            'ibm-plex-sans': '\'IBM Plex Sans\', var(--font-sans)',
            'fira-sans': '\'Fira Sans\', var(--font-sans)',
            'eb-garamond': '\'EB Garamond\', var(--font-sans)',
            'crimson-pro': '\'Crimson Pro\', var(--font-sans)',
            'exo-2': '\'Exo 2\', var(--font-sans)',
            'dancing-script': '\'Dancing Script\', var(--font-sans)',
            'overpass': '\'Overpass\', var(--font-sans)',
            'alegreya': '\'Alegreya\', Georgia, \'Times New Roman\', serif',
            'alegreya-sans': '\'Alegreya Sans\', var(--font-sans)',
            'jetbrains-mono': '\'JetBrains Mono\', var(--font-mono)',
            'work-sans': '\'Work Sans\', var(--font-sans)',
            'etbb': '\'ETbb\', Georgia, \'Times New Roman\', serif',
            'reforma-1918': '\'Reforma 1918\', var(--font-sans)',
        };
        const selectedFont = fonts[fontId] ? fontId : 'inter';
        const family = fonts[selectedFont];
        currentFont = selectedFont;
        log.debug('[font] Applying: ' + selectedFont);

        const nameEl = isActivePanel(root) ? findIn(root, '#font-current-name') : null;
        const fontInfo = FONTS.find(f => f.id === selectedFont);
        if (nameEl && fontInfo) nameEl.textContent = fontInfo.name;

        document.documentElement.style.setProperty('--font-editor', family);
        // Overlay UI is mounted directly under <body>, outside #app. Keep it
        // on the chosen reading font without changing the intentionally
        // separate code-font setting.
        document.documentElement.style.setProperty('--font-ui', family);

        // Inject CSS override — fonts.css handles @font-face declarations
        let style = document.getElementById('dynamic-font-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'dynamic-font-style';
            document.head.appendChild(style);
        }
        style.textContent = `.cm-editor:not(.cm-code-file), .cm-editor:not(.cm-code-file) .cm-content, .cm-editor:not(.cm-code-file) .cm-line, .cm-editor:not(.cm-code-file) .cm-scroller { font-family: ${family} !important; }`;

        requestAnimationFrame(() => {
            document.querySelectorAll('.cm-editor:not(.cm-code-file), .cm-editor:not(.cm-code-file) .cm-content, .cm-editor:not(.cm-code-file) .cm-line, .cm-editor:not(.cm-code-file) .cm-scroller').forEach(el => {
                el.style.fontFamily = family;
            });
            import('./editor.js').then(({ getEditorView }) => {
                const view = getEditorView();
                if (view) view.requestMeasure();
            });
        });

        if (!initial) {
            log.debug('[font] Saving to backend...');
            fontSaveQueue = fontSaveQueue
                .catch(() => {})
                .then(() => window.pywebview.api.font_save(selectedFont))
                .catch(e => log.warn('[font] Save failed: ' + e));
        }
    } catch(e) {
        log.error('[font] applyFont crashed: ' + e.message);
    }
}

function applyCodeFont(fontId, initial, root = document) {
    try {
        const selected = CODE_FONTS.find(font => font.id === fontId) || CODE_FONTS[0];
        currentCodeFont = selected.id;
        document.documentElement.style.setProperty('--font-code', selected.family);

        const nameEl = isActivePanel(root) ? findIn(root, '#code-font-current-name') : null;
        if (nameEl) nameEl.textContent = selected.name;
        const menu = isActivePanel(root) ? findIn(root, '#code-font-picker-menu') : null;
        menu?.querySelectorAll('.code-font-picker-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === selected.id);
        });

        let style = document.getElementById('dynamic-code-font-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'dynamic-code-font-style';
            document.head.appendChild(style);
        }
        style.textContent = `.cm-editor.cm-code-file, .cm-editor.cm-code-file .cm-content, .cm-editor.cm-code-file .cm-line, .cm-editor.cm-code-file .cm-scroller { font-family: ${selected.family} !important; }`;

        requestAnimationFrame(() => {
            document.querySelectorAll('.cm-editor.cm-code-file, .cm-editor.cm-code-file .cm-content, .cm-editor.cm-code-file .cm-line, .cm-editor.cm-code-file .cm-scroller').forEach(element => {
                element.style.fontFamily = selected.family;
            });
            import('./editor.js').then(({ getEditorView }) => {
                const view = getEditorView();
                if (view) view.requestMeasure();
            });
        });

        if (!initial) {
            codeFontSaveQueue = codeFontSaveQueue
                .catch(() => {})
                .then(() => window.pywebview.api.code_font_save(selected.id))
                .catch(error => log.warn('[code-font] Save failed: ' + error));
        }
    } catch (error) {
        log.error('[code-font] applyCodeFont crashed: ' + error.message);
    }
}

function initFontSize(root) {
    const down = findIn(root, '#font-size-down');
    const up = findIn(root, '#font-size-up');
    const display = findIn(root, '#font-size-value');
    if (!down || !up || !display) return;

    const KEY = 'editor-font-size';
    const DEFAULT = 100;
    const MIN = 70;
    const MAX = 150;
    const STEP = 10;

    let current = parseInt(localStorage.getItem(KEY)) || DEFAULT;
    applyFontSize(current);

    down.addEventListener('click', () => {
        if (current > MIN) { current -= STEP; applyFontSize(current); localStorage.setItem(KEY, String(current)); }
    });
    up.addEventListener('click', () => {
        if (current < MAX) { current += STEP; applyFontSize(current); localStorage.setItem(KEY, String(current)); }
    });

    function applyFontSize(pct) {
        display.textContent = pct + '%';
        const scale = pct / 100;
        document.documentElement.style.setProperty('--font-size-editor', (18 * scale) + 'px');
        document.documentElement.style.setProperty('--line-height-editor', (1.65 * scale).toFixed(2));

        import('./editor.js').then(({ getEditorView }) => {
            const view = getEditorView();
            if (view) view.requestMeasure();
        });
    }
}

function initTextWidth(root) {
    const down = findIn(root, '#text-width-down');
    const up = findIn(root, '#text-width-up');
    const display = findIn(root, '#text-width-value');
    if (!down || !up || !display) return;

    const KEY = 'editor-text-width';
    const DEFAULT = 100;
    const MIN = 50;
    const MAX = 200;
    const STEP = 10;
    const BASE_WIDTH = 700;

    let current = parseInt(localStorage.getItem(KEY)) || DEFAULT;
    applyTextWidth(current);

    down.addEventListener('click', () => {
        if (current > MIN) { current -= STEP; applyTextWidth(current); localStorage.setItem(KEY, String(current)); }
    });
    up.addEventListener('click', () => {
        if (current < MAX) { current += STEP; applyTextWidth(current); localStorage.setItem(KEY, String(current)); }
    });

    function applyTextWidth(pct) {
        display.textContent = pct + '%';
        const width = Math.round(BASE_WIDTH * pct / 100);
        document.documentElement.style.setProperty('--editor-width', width + 'px');

        import('./editor.js').then(({ getEditorView }) => {
            const view = getEditorView();
            if (view) view.requestMeasure();
        });
    }
}

function initAutoSave(root) {
    const asSelect = findIn(root, '#auto-save-interval');
    const acSelect = findIn(root, '#auto-commit-interval');

    if (asSelect) {
        try {
            window.pywebview.api.auto_save_load().then(seconds => {
                if (isActivePanel(root)) asSelect.value = String(seconds);
            }).catch(() => {});
        } catch (_) { /* noop */ }
        asSelect.addEventListener('change', () => {
            const seconds = parseInt(asSelect.value) || 0;
            try {
                window.pywebview.api.auto_save_save(seconds)
                    .then(() => window.dispatchEvent(new CustomEvent('figaro:auto-save-interval', { detail: { seconds } })))
                    .catch(() => {});
            } catch (_) { /* noop */ }
        });
    }

    if (acSelect) {
        try {
            window.pywebview.api.auto_commit_load().then(seconds => {
                if (isActivePanel(root)) acSelect.value = String(seconds);
            }).catch(() => {});
        } catch (_) { /* noop */ }
        acSelect.addEventListener('change', () => {
            const seconds = parseInt(acSelect.value) || 0;
            try { window.pywebview.api.auto_commit_save(seconds).catch(() => {}); } catch (_) { /* noop */ }
        });
    }
}

export default {
    initTheme, applyTheme, getCurrentTheme, getCurrentFont, getThemes,
    initVimPreference, getVimPreference, setVimPreference, initSettingsPanel
};
