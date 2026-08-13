import { markBlockWidget, wrapBlockWidget } from '../frontend/js/blockWidget.js';
import { readApplicationStyles } from '../support/styleSources.js';

const stylesheet = readApplicationStyles();

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
        expect(declarationsFor('.cm-frontmatter-panel-section')).toMatch(/display:\s*grid/);
        expect(declarationsFor('.cm-frontmatter-panel-section')).toMatch(/gap:\s*7px/);
        expect(declarationsFor('.cm-block-widget--diagram')).toMatch(/padding:\s*8px 0/);
        expect(declarationsFor('.cm-block-widget--mermaid')).toMatch(/width:\s*min\(100%, calc\(var\(--mermaid-editor-viewport-width, 100vw\) - 132px\)\)/);
        expect(declarationsFor('.cm-block-widget--mermaid')).toMatch(/padding-right:\s*112px/);
        expect(declarationsFor('.cm-scroller.cm-mermaid-editor-stacked .cm-block-widget--mermaid'))
            .toMatch(/padding:\s*40px 0 8px/);
        expect(declarationsFor('.tbl-table-widget')).toMatch(/margin-top:\s*0\s*!important/);
        expect(declarationsFor('.tbl-table-widget')).toMatch(/margin-bottom:\s*0\s*!important/);
        expect(declarationsFor('.tbl-table-widget')).toMatch(/padding-top:\s*44px\s*!important/);
        expect(declarationsFor('.tbl-delete-table-button')).toMatch(/position:\s*absolute/);
        expect(declarationsFor('.cm-table-source-toggle')).toMatch(/margin:\s*0\s*!important/);
        expect(declarationsFor('.cm-table-source-toggle')).toMatch(/padding-bottom:\s*6px/);
    });

    test('keeps the frontmatter disclosure aligned while its panel changes height', () => {
        expect(declarationsFor('.cm-scroller')).toMatch(/scrollbar-gutter:\s*stable/);
        expect(declarationsFor('.cm-frontmatter-disclosure')).toMatch(/width:\s*16px/);
        expect(declarationsFor('.cm-frontmatter-disclosure')).toMatch(/transition:\s*transform/);
        expect(declarationsFor('.cm-frontmatter-disclosure.expanded')).toMatch(/rotate\(90deg\)/);
    });

    test('top-aligns Markdown block guides and provides fold-anchor scroll space', () => {
        expect(declarationsFor('.cm-markdownBlockGutter .cm-gutterElement'))
            .toMatch(/align-items:\s*flex-start/);
        expect(declarationsFor('.cm-markdownBlockGutter'))
            .toMatch(/translateY\(-16px\)/);
    });

    test('keeps expanded frontmatter menus above later editor lines', () => {
        const widgetRoot = declarationsFor('.cm-block-widget--frontmatter-panel');
        const panelEntrance = declarationsFor('.cm-frontmatter-panel--enter');

        expect(widgetRoot).toMatch(/position:\s*relative/);
        expect(widgetRoot).toMatch(/z-index:\s*2/);
        expect(panelEntrance).toMatch(/animation:\s*figaro-properties-expand/);
        expect(panelEntrance).not.toMatch(/\bboth\b/);
    });
});
