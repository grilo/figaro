import { readApplicationStyles } from '../support/styleSources.js';

const stylesheet = readApplicationStyles();

function declarationsFor(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`Missing CSS rule for ${selector}`);
    return match[1];
}

describe('Find and Replace layout', () => {
    test('keeps search, options, and replacement controls on three compact bands', () => {
        const panel = declarationsFor('.cm-panel.cm-search');
        expect(panel).toMatch(/display:\s*grid/);
        expect(panel).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) repeat\(3, max-content\)/);
        expect(panel).toMatch(/grid-template-rows:\s*repeat\(3, 28px\)/);
        expect(panel).toMatch(/padding:\s*6px 40px 6px 14px\s*!important/);

        expect(declarationsFor('.cm-panel.cm-search .cm-textfield[name="search"]'))
            .toMatch(/grid-row:\s*1/);
        expect(declarationsFor('.cm-panel.cm-search > label:has([name="case"])'))
            .toMatch(/grid-row:\s*2/);
        expect(declarationsFor('.cm-panel.cm-search .cm-textfield[name="replace"]'))
            .toMatch(/grid-row:\s*3/);
        expect(declarationsFor('.cm-panel.cm-search > br')).toMatch(/display:\s*none/);
    });
});
