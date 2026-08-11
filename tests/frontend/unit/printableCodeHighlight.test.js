import {
    planPrintableCodeHighlight,
    printableCodeLanguage,
} from '../frontend/js/core/printableCodeHighlight.js';

describe('printable fenced-code highlighting plan', () => {
    test('uses a declared language before auto-detection and preserves highlighter markup', () => {
        const highlight = jest.fn((_source, language) => ({
            html: '<span class="hljs-keyword">const</span> answer = 42;',
            language: language || 'javascript',
            detected: !language,
        }));

        expect(printableCodeLanguage(['figaro-print-code', 'language-JavaScript'])).toBe('javascript');
        expect(planPrintableCodeHighlight({
            source: 'const answer = 42;',
            classNames: 'language-JavaScript extra',
            highlight,
        })).toEqual({
            html: '<span class="hljs-keyword">const</span> answer = 42;',
            language: 'javascript',
            detected: false,
        });
        expect(highlight).toHaveBeenCalledWith('const answer = 42;', 'javascript');
    });

    test('allows untyped fences to use detection and safely declines a failed highlighter', () => {
        expect(planPrintableCodeHighlight({
            source: 'const answer = 42;',
            classNames: [],
            highlight: () => ({ html: 'highlighted', language: 'javascript', detected: true }),
        })).toEqual({ html: 'highlighted', language: 'javascript', detected: true });
        expect(planPrintableCodeHighlight({
            source: 'source',
            classNames: [],
            highlight: () => { throw new Error('unavailable'); },
        })).toBeNull();
    });
});
