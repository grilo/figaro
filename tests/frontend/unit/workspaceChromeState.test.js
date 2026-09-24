import { initWorkspaceChromeState } from '../../../frontend/js/workspaceChromeState.js';

function setup(tabs = ['a', 'b'], active = 'a') {
    document.body.innerHTML = '<div id="app"><div id="tab-strip"></div></div>';
    const strip = document.getElementById('tab-strip');
    const render = (ids, activeId) => {
        strip.innerHTML = ids.map(id => `<div class="ui-document-tab${id === activeId ? ' ui-document-tab--active' : ''}" data-id="${id}"><span>${id}</span></div>`).join('');
    };
    render(tabs, active);
    const listeners = new Set();
    const state = { activeTabId: active, openTabs: [{ id: 'a', type: 'file' }, { id: 'cal', type: 'calendar-workspace' }] };
    const dispose = initWorkspaceChromeState({
        subscribe: (key, fn) => { listeners.add(fn); return () => listeners.delete(fn); },
        getState: key => state[key],
    });
    const app = document.getElementById('app');
    return { app, strip, render, state, notify: () => listeners.forEach(fn => fn()), dispose };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('mirrors whether the leading tab is active as it changes', async () => {
    const { app, render, dispose } = setup(['a', 'b'], 'a');
    expect(app.hasAttribute('data-first-tab-active')).toBe(true);
    render(['a', 'b'], 'b'); await flush();
    expect(app.hasAttribute('data-first-tab-active')).toBe(false);
    render(['b', 'a'], 'b'); await flush();
    expect(app.hasAttribute('data-first-tab-active')).toBe(true);
    render([], null); await flush();
    expect(app.hasAttribute('data-first-tab-active')).toBe(false);
    dispose();
});

test('marks hover only over an inactive leading tab', async () => {
    const { app, strip, render, dispose } = setup(['a', 'b'], 'b');
    const first = strip.firstElementChild;
    first.querySelector('span').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(app.hasAttribute('data-first-tab-hover')).toBe(true);
    // Moving within the tab keeps it; leaving to the second tab clears it.
    first.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: first.querySelector('span') }));
    expect(app.hasAttribute('data-first-tab-hover')).toBe(true);
    first.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: strip.children[1] }));
    expect(app.hasAttribute('data-first-tab-hover')).toBe(false);
    // An active leading tab never shows the inactive hover seam.
    strip.firstElementChild.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    render(['a', 'b'], 'a'); await flush();
    expect(app.hasAttribute('data-first-tab-hover')).toBe(false);
    dispose();
});

test('marks the Calendar workspace from the active tab and stops after disposal', async () => {
    const { app, state, notify, render, dispose } = setup();
    expect(app.hasAttribute('data-workspace-view')).toBe(false);
    state.activeTabId = 'cal'; notify();
    expect(app.getAttribute('data-workspace-view')).toBe('calendar');
    state.activeTabId = 'a'; notify();
    expect(app.hasAttribute('data-workspace-view')).toBe(false);
    dispose();
    render(['a'], 'x'); await flush();
    expect(app.hasAttribute('data-first-tab-active')).toBe(true);
});

test('does not rewrite unchanged attributes', async () => {
    const { app, render, dispose } = setup(['a', 'b'], 'a');
    const changes = [];
    new MutationObserver(list => changes.push(...list)).observe(app, { attributes: true });
    render(['a', 'b', 'c'], 'a'); await flush();
    expect(changes).toEqual([]);
    dispose();
});

test('no stylesheet uses :has() on html, body or #app', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const files = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.css')) files.push(full);
        }
    };
    walk(path.resolve('frontend/styles'));
    walk(path.resolve('frontend/design-system'));
    const offending = [];
    for (const file of files) {
        const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const match of css.matchAll(/(?:^|[\s,>])(?:html|body|#app)[^\s,{>]*:has\(/gm)) offending.push(`${path.relative(process.cwd(), file)}: ${match[0].trim()}`);
    }
    // With the application root as the subject, every DOM change anywhere
    // re-checks the rule and restyles the page (see workspaceChromeState.js).
    expect(offending).toEqual([]);
});
