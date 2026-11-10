import { escapeHtml } from '../frontend/js/core/htmlEscape.js';

describe('HTML escaping for vault-controlled strings', () => {
    test('a quoted file name cannot leave the attribute it is written into', () => {
        const name = 'a" onmouseover="alert(1)';
        const host = document.createElement('div');
        host.innerHTML = `<span data-path="${escapeHtml(name)}" title='${escapeHtml('it\'s')}'>${escapeHtml(name)}</span>`;
        const span = host.firstElementChild;

        expect(span.getAttributeNames().sort()).toEqual(['data-path', 'title']);
        expect(span.dataset.path).toBe(name);
        expect(span.title).toBe('it\'s');
        expect(span.textContent).toBe(name);
    });

    test('markup characters become text and missing values become empty', () => {
        expect(escapeHtml('<img src=x onerror=1> & `tick`')).toBe('&lt;img src=x onerror=1&gt; &amp; &#96;tick&#96;');
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml(42)).toBe('42');
    });
});
