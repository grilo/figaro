import { readFileSync } from 'node:fs';
import { markBlockWidget, wrapBlockWidget } from '../frontend/js/blockWidget.js';

const stylesheet = readFileSync('frontend/styles.css', 'utf8');

function declarationsFor(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`Missing CSS rule for ${selector}`);
    return match[1];
}

describe('CodeMirror block-widget layout contract', () => {
    test('owns visual spacing on the measured widget root', () => {
        const surface = document.createElement('button');
        const wrapper = wrapBlockWidget(surface, 'cm-block-widget--example');

        expect(wrapper.classList.contains('cm-block-widget')).toBe(true);
        expect(wrapper.classList.contains('cm-block-widget-spacing')).toBe(true);
        expect(wrapper.firstElementChild).toBe(surface);

        const alreadyMeasured = document.createElement('div');
        expect(markBlockWidget(alreadyMeasured)).toBe(alreadyMeasured);
        expect(alreadyMeasured.classList.contains('cm-block-widget')).toBe(true);
    });

    test('forbids external vertical margins on project block-widget surfaces', () => {
        expect(declarationsFor('.cm-block-widget')).toMatch(/margin-top:\s*0\s*!important/);
        expect(declarationsFor('.cm-block-widget')).toMatch(/margin-bottom:\s*0\s*!important/);

        for (const selector of [
            '.cm-frontmatter',
            '.cm-add-properties',
            '.cm-frontmatter-panel',
            '.cm-live-diagram',
        ]) {
            expect(declarationsFor(selector)).toMatch(/margin:\s*0(?:\s+auto)?\s*;/);
        }
    });

    test('expresses widget breathing room as measured padding', () => {
        expect(declarationsFor('.cm-block-widget--frontmatter')).toMatch(/padding:\s*2px 0 14px/);
        expect(declarationsFor('.cm-block-widget--add-properties')).toMatch(/padding:\s*3px 0 14px/);
        expect(declarationsFor('.cm-block-widget--frontmatter-panel')).toMatch(/padding:\s*2px 0 16px/);
        expect(declarationsFor('.cm-block-widget--diagram')).toMatch(/padding:\s*8px 0/);
        expect(declarationsFor('.cm-table-source-toggle')).toMatch(/margin:\s*0\s*!important/);
        expect(declarationsFor('.cm-table-source-toggle')).toMatch(/padding-bottom:\s*6px/);
    });
});
