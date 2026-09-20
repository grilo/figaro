import { createSpellingDictionarySettings, createSpellingDictionaryEditor } from '../../../frontend/js/views/spellingDictionarySettings.js';
import { createSpellingDictionary } from '../../../frontend/js/usecases/spellingDictionary.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(initial = ['zebra', 'café']) {
    let words = initial.slice();
    const add = jest.fn(async word => (words = [...new Set([...words, word])].sort()));
    const remove = jest.fn(async word => (words = words.filter(value => value !== word)));
    const dictionary = createSpellingDictionary({ load: async () => words, add, remove });
    const view = createSpellingDictionaryEditor(dictionary);
    document.body.replaceChildren(view.element);
    return { ...view, dictionary, add, remove };
}
const button = (root, label) => [...root.querySelectorAll('button')].find(node => (node.getAttribute('aria-label') || node.textContent) === label);

test('personal dictionary searches canonical accents, adds, removes, and undoes without replacing other words', async () => {
    const view = setup(); await view.ready;
    const { element } = view;
    expect(element.querySelector('[data-count]').textContent).toBe('2 accepted words');
    expect([...element.querySelectorAll('li span')].map(node => node.textContent)).toEqual(['café', 'zebra']);
    const search = element.querySelector('[type="search"]');
    search.value = 'CAFE\u0301'; search.dispatchEvent(new Event('input'));
    expect(element.querySelectorAll('li')).toHaveLength(1);
    button(element, 'Remove café').click(); await flush();
    expect(view.dictionary.words()).toEqual(['zebra']);
    expect(document.activeElement).toBe(button(element, 'Undo'));
    await view.dictionary.add('figaro');
    button(element, 'Undo').click(); await flush();
    expect(view.dictionary.words()).toEqual(['café', 'figaro', 'zebra']);
    const input = element.querySelector('#personal-dictionary-word');
    input.value = 'codex'; element.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush(); expect(view.add).toHaveBeenLastCalledWith('codex');
    expect(document.activeElement).toBe(input);
    expect(element.querySelector('[data-count]').textContent).toContain('4 accepted words');
    view.dispose();
});

test('failed dictionary removal keeps the word, reports an error, and retries before offering Undo', async () => {
    const view = setup(); await view.ready;
    view.remove.mockRejectedValueOnce(new Error('Disk full'));
    button(view.element, 'Remove zebra').click(); await flush();
    expect(view.dictionary.words()).toContain('zebra');
    expect(view.element.querySelector('[data-status]').textContent).toBe('Disk full');
    expect(button(view.element, 'Undo').hidden).toBe(true);
    expect(document.activeElement).toBe(button(view.element, 'Retry'));
    button(view.element, 'Retry').click(); await flush();
    expect(view.dictionary.words()).not.toContain('zebra');
    expect(button(view.element, 'Undo').hidden).toBe(false);
    view.dispose();
});

test('load failure disables mutations until Retry succeeds; empty and bounded lists remain usable', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('Unreadable')).mockResolvedValueOnce([]);
    const dictionary = createSpellingDictionary({ load, add: jest.fn() });
    const view = createSpellingDictionaryEditor(dictionary); document.body.replaceChildren(view.element);
    await view.ready;
    expect(view.element.querySelector('#personal-dictionary-word').disabled).toBe(true);
    button(view.element, 'Retry').click(); await flush();
    expect(view.element.textContent).toContain('No accepted words yet');
    expect(view.element.querySelector('#personal-dictionary-word').disabled).toBe(false);
    view.dispose();
    const many = setup(Array.from({ length: 105 }, (_, i) => `word${i}`)); await many.ready;
    expect(many.element.querySelectorAll('li')).toHaveLength(100);
    button(many.element, 'Show more').click();
    expect(many.element.querySelectorAll('li')).toHaveLength(105);
    many.dispose();
});

test('pending saves retain effective words and disposing unsubscribes the Settings view', async () => {
    const view = setup(); await view.ready;
    let finish;
    view.remove.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    button(view.element, 'Remove zebra').click(); await flush();
    expect(view.element.getAttribute('aria-busy')).toBe('true');
    expect(button(view.element, 'Remove zebra').disabled).toBe(true);
    expect(view.dictionary.words()).toContain('zebra');
    view.dispose(); const before = view.element.innerHTML;
    finish(['café']); await flush();
    expect(view.dictionary.words()).toEqual(['café']);
    expect(view.element.innerHTML).toBe(before);
});


test('failed Add preserves the input and failed Undo remains available for retry', async () => {
    const view = setup(); await view.ready;
    const input = view.element.querySelector('#personal-dictionary-word');
    view.add.mockRejectedValueOnce(new Error('Invalid word'));
    input.value = 'two words'; view.element.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(input.value).toBe('two words');
    expect(view.dictionary.words()).toEqual(['zebra', 'café']);
    expect(view.element.querySelector('[data-status]').textContent).toBe('Invalid word');
    button(view.element, 'Remove zebra').click(); await flush();
    view.add.mockRejectedValueOnce(new Error('Disk full'));
    button(view.element, 'Undo').click(); await flush();
    expect(view.dictionary.words()).toEqual(['café']);
    expect(button(view.element, 'Undo').hidden).toBe(false);
    button(view.element, 'Retry').click(); await flush();
    expect(view.dictionary.words()).toEqual(['café', 'zebra']);
    expect(button(view.element, 'Undo').hidden).toBe(true);
    view.dispose();
});


test('Settings stays compact and the shared dictionary dialog restores focus and retains its draft', async () => {
    const dictionary = createSpellingDictionary({ load: async () => Array.from({ length: 205 }, (_, i) => `word${i}`) });
    const view = createSpellingDictionarySettings(dictionary);
    const app = document.createElement('main'); app.id = 'app'; app.append(view.element); document.body.replaceChildren(app);
    await view.ready;
    const manage = view.element.querySelector('button');
    expect(view.element.textContent).toContain('205 accepted words');
    expect(view.element.querySelector('input, ul')).toBeNull();
    manage.focus(); manage.click(); await flush();
    const dialog = document.querySelector('[role="dialog"]');
    const search = dialog.querySelector('[type="search"]');
    expect(document.activeElement).toBe(search); expect(app.hasAttribute('inert')).toBe(true);
    expect(dialog.querySelectorAll('li')).toHaveLength(100);
    search.value = 'word2'; search.dispatchEvent(new Event('input'));
    dialog.querySelector('#personal-dictionary-word').value = 'unfinished';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(app.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(manage);
    manage.click(); await flush();
    expect(document.querySelector('[type="search"]').value).toBe('word2');
    expect(document.querySelector('#personal-dictionary-word').value).toBe('unfinished');
    view.dispose(); expect(document.querySelector('[role="dialog"]')).toBeNull();
});

test('closing during a save never steals focus; a later failure stays visible in Settings and can be retried', async () => {
    let fail;
    const remove = jest.fn().mockImplementationOnce(() => new Promise((resolve, reject) => { fail = reject; })).mockResolvedValue([]);
    const dictionary = createSpellingDictionary({ load: async () => ['word'], remove });
    const view = createSpellingDictionarySettings(dictionary); document.body.replaceChildren(view.element); await view.ready;
    const manage = view.element.querySelector('button'); manage.focus(); manage.click(); await flush();
    button(document, 'Remove word').click(); await flush();
    document.querySelector('[data-dictionary-done]').click(); await flush();
    fail(new Error('Disk full')); await flush();
    expect(document.activeElement).toBe(manage);
    expect(view.element.textContent).toContain('needs attention');
    manage.click(); await flush();
    expect(document.querySelector('[data-status]').textContent).toBe('Disk full');
    button(document, 'Retry').click(); await flush();
    expect(view.element.textContent).toContain('0 accepted words');
    view.dispose();
});
