import { personalDictionaryList } from '../core/spellingDictionaryModel.js';
import { activateModal, createDialogShell } from '../dialogs.js';
import { makeEditorModalResizable } from '../editorModalResize.js';

/** Reusable dictionary editor; mutations share the vault dictionary with inline review. */
export function createSpellingDictionaryEditor(dictionary, { onState = () => {} } = {}) {
    const element = document.createElement('section');
    element.className = 'spelling-dictionary-editor';
    element.innerHTML = `
        <label for="personal-dictionary-search">Search words</label>
        <input id="personal-dictionary-search" class="ui-field ui-field--quiet" type="search" autocomplete="off">
        <form class="spelling-dictionary-add">
            <label for="personal-dictionary-word">Add word</label>
            <div class="spelling-dictionary-actions"><input id="personal-dictionary-word" class="ui-field ui-field--quiet" autocomplete="off" spellcheck="false" required maxlength="256"><button class="ui-button" type="submit">Add</button></div>
        </form>
        <p class="settings-section-desc" data-count></p>
        <ul class="spelling-dictionary-list" aria-label="Accepted words"></ul>
        <button class="ui-button" type="button" data-more hidden>Show more</button>
        <div class="spelling-dictionary-actions"><p class="ui-notice" role="status" aria-live="polite" data-status>Loading dictionary…</p><button class="ui-button" type="button" data-undo hidden>Undo</button><button class="ui-button" type="button" data-retry hidden>Retry</button></div>`;
    const search = element.querySelector('[type="search"]');
    const input = element.querySelector('#personal-dictionary-word');
    const form = element.querySelector('form');
    const list = element.querySelector('ul');
    const count = element.querySelector('[data-count]');
    const status = element.querySelector('[data-status]');
    const undo = element.querySelector('[data-undo]');
    const retry = element.querySelector('[data-retry]');
    const more = element.querySelector('[data-more]');
    let pending = true, loaded = false, disposed = false, removed = null, retryAction = null, limit = 100;
    function render() {
        if (disposed) return;
        const entries = personalDictionaryList(dictionary.words(), search.value, limit);
        count.textContent = loaded ? `${entries.count} accepted ${entries.count === 1 ? 'word' : 'words'}${search.value ? ` · ${entries.matching} matching` : ''}` : '';
        list.replaceChildren();
        for (const word of entries.visible) {
            const row = document.createElement('li');
            const label = document.createElement('span');
            label.textContent = word;
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'ui-button ui-button--quiet';
            button.textContent = 'Remove'; button.setAttribute('aria-label', `Remove ${word}`);
            button.disabled = pending;
            button.addEventListener('click', () => void run(async () => {
                await dictionary.remove(word); removed = word;
                return `Removed “${word}”.`;
            }, undo));
            row.append(label, button); list.append(row);
        }
        if (loaded && !entries.matching) {
            const empty = document.createElement('li');
            empty.className = 'settings-section-desc';
            empty.textContent = entries.count ? 'No matching words.' : 'No accepted words yet. Add one here or from a spelling suggestion.';
            list.append(empty);
        }
        more.hidden = !entries.more; more.disabled = pending;
        input.disabled = pending || !loaded;
        form.querySelector('button').disabled = pending || !loaded;
        undo.hidden = !removed; undo.disabled = pending;
        retry.hidden = !retryAction; retry.disabled = pending;
        element.setAttribute('aria-busy', String(pending));
        onState({ count: entries.count, loaded, pending, error: Boolean(retryAction) });
    }
    async function run(action, focusTarget) {
        if (pending || disposed) return;
        pending = true; retryAction = null;
        status.className = 'ui-notice'; status.textContent = 'Saving…'; render();
        let succeeded = false;
        try {
            const message = await action();
            if (!disposed) { status.textContent = message; succeeded = true; }
        } catch (error) {
            retryAction = () => run(action, focusTarget);
            if (!disposed) { status.className = 'ui-notice ui-notice--danger'; status.textContent = error?.message || 'Could not save dictionary. Retry.'; }
        } finally {
            pending = false; render();
            if (!disposed && element.isConnected) (succeeded ? focusTarget : retry)?.focus();
        }
    }
    async function restore() {
        const restoreFocus = document.activeElement === retry;
        pending = true; retryAction = null; status.className = 'ui-notice'; status.textContent = 'Loading dictionary…'; render();
        try { await dictionary.restore(); loaded = true; status.textContent = 'Changes save automatically.'; }
        catch (error) { retryAction = restore; status.className = 'ui-notice ui-notice--danger'; status.textContent = error?.message || 'Could not load dictionary.'; }
        finally { pending = false; render(); if (!disposed && element.isConnected && loaded && restoreFocus) search.focus(); }
    }
    form.addEventListener('submit', event => {
        event.preventDefault();
        const word = input.value.trim();
        if (!word) return;
        void run(async () => { await dictionary.add(word); input.value = ''; return `Accepted “${word}”.`; }, input);
    });
    search.addEventListener('input', () => { limit = 100; render(); });
    more.addEventListener('click', () => { limit += 100; render(); if (more.hidden) list.querySelector('li:last-child button')?.focus(); });
    undo.addEventListener('click', () => {
        const word = removed;
        if (word) void run(async () => { await dictionary.add(word); removed = null; return `Restored “${word}”.`; }, search);
    });
    retry.addEventListener('click', () => void retryAction?.());
    const unsubscribe = dictionary.subscribe(render);
    const ready = restore();
    return { element, ready, focus() { search.focus(); }, dispose() { disposed = true; unsubscribe(); } };
}


/** Compact Settings launcher; the bounded editor uses the shared modal lifecycle. */
export function createSpellingDictionarySettings(dictionary) {
    const element = document.createElement('section');
    element.className = 'settings-section spelling-dictionary-settings';
    element.setAttribute('aria-labelledby', 'personal-dictionary-title');
    element.innerHTML = `
        <div><h3 id="personal-dictionary-title" class="settings-section-icon">Personal dictionary</h3>
        <p class="settings-section-desc" data-dictionary-summary aria-live="polite">Loading dictionary…</p></div>
        <button id="personal-dictionary-manage" class="ui-button" type="button" aria-haspopup="dialog">Manage…</button>`;
    const launcher = element.querySelector('button');
    const summary = element.querySelector('[data-dictionary-summary]');
    const editor = createSpellingDictionaryEditor(dictionary, { onState({ count, loaded, pending, error }) {
        summary.textContent = error ? 'Dictionary needs attention · open to retry.' : loaded
            ? `${count} accepted ${count === 1 ? 'word' : 'words'} · this vault${pending ? ' · Saving…' : ''}` : 'Loading dictionary…';
    } });
    let lifecycle = null, resize = null, disposed = false;
    function open() {
        if (disposed) return;
        if (lifecycle) { editor.focus(); return; }
        const { overlay, modal } = createDialogShell({
            title: 'Personal dictionary',
            description: 'Accepted words for all notes in this vault. Removing a word allows spelling review to flag it again.',
            icon: 'edit', className: 'spelling-dictionary-modal',
            content: '<div class="spelling-dictionary-host"></div>',
            footer: '<button type="button" class="ui-button custom-modal-btn" data-dictionary-done>Done</button>',
        });
        overlay.querySelector('.spelling-dictionary-host').append(editor.element);
        resize = makeEditorModalResizable(modal, { minimumWidth: 360, minimumHeight: 480 });
        lifecycle = activateModal(overlay, {
            initialFocus: () => editor.element.querySelector('[type="search"]'),
            onDismiss() { resize?.destroy(); resize = null; lifecycle = null; },
        });
        overlay.querySelector('[data-dictionary-done]').addEventListener('click', () => lifecycle?.dismiss());
    }
    launcher.addEventListener('click', open);
    return { element, ready: editor.ready, open, dispose() {
        disposed = true;
        lifecycle?.dismiss(false);
        editor.dispose();
    } };
}
