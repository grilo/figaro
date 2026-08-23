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
        expect(declarationsFor('.cm-block-widget--table')).toMatch(/padding:\s*8px 0/);
        expect(declarationsFor('.cm-live-table')).toMatch(/width:\s*100%/);
        expect(declarationsFor('.cm-live-table')).toMatch(/height:\s*100%/);
        expect(declarationsFor('.cm-live-table')).toMatch(/overflow:\s*auto/);
        expect(declarationsFor('.cm-live-table table')).toMatch(/border-collapse:\s*collapse/);
    });

    test('pins approved rendered blocks to their measured source height', () => {
        const footprint = declarationsFor('.cm-source-footprint');
        expect(footprint).toMatch(/height:\s*var\(--cm-source-footprint-height\)/);
        expect(footprint).toMatch(/min-height:\s*var\(--cm-source-footprint-height\)/);
        expect(footprint).toMatch(/max-height:\s*var\(--cm-source-footprint-height\)/);
        expect(declarationsFor('.cm-source-footprint--graphic')).toMatch(/overflow:\s*hidden/);
        expect(declarationsFor('.cm-source-footprint--scroll')).toMatch(/overflow:\s*auto\s*!important/);
        expect(declarationsFor('.cm-source-footprint-sizer')).toMatch(/position:\s*absolute/);
        expect(declarationsFor('.cm-source-footprint-sizer')).toMatch(/visibility:\s*hidden/);
        expect(declarationsFor('.cm-source-footprint-sizer-line')).toMatch(/white-space:\s*break-spaces/);
        expect(declarationsFor('.cm-source-footprint-sizer-line')).toMatch(/overflow-wrap:\s*anywhere/);
        expect(declarationsFor('.cm-source-footprint[data-source-footprint-state="underflow"]::after'))
            .toMatch(/border:\s*1px dashed var\(--border-light\)/);
        expect(declarationsFor('.cm-live-diagram')).toMatch(/height:\s*100%/);
        expect(declarationsFor('.cm-live-diagram-view')).toMatch(/min-height:\s*0/);
        expect(declarationsFor('.cm-codeblock-widget'))
            .toMatch(/tab-size:\s*var\(--editor-tab-size, 4\)/);
    });

    test('themes missing-image feedback and keeps it to one source-line footprint', () => {
        const error = declarationsFor('.cm-editor .cm-image-error');
        const errorStates = [...stylesheet.matchAll(/\.cm-editor \.cm-image-error\s*\{([^}]*)\}/g)];
        const errorState = errorStates.at(-1)?.[1] || '';
        const spinnerStates = [...stylesheet.matchAll(/\.cm-editor \.cm-image-spinner\s*\{([^}]*)\}/g)];
        const reducedMotionSpinner = spinnerStates.at(-1)?.[1] || '';
        const loading = declarationsFor('.cm-editor .cm-image-loading');
        expect(error).toMatch(/height:\s*1\.65em\s*!important/);
        expect(error).toMatch(/min-height:\s*1\.65em\s*!important/);
        expect(errorState).toMatch(/var\(--danger-color\)/);
        expect(errorState).toMatch(/var\(--panel-bg\)/);
        expect(loading).toMatch(/background:\s*var\(--panel-bg\)\s*!important/);
        expect(stylesheet).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
        expect(reducedMotionSpinner).toMatch(/animation:\s*none\s*!important/);
        expect(declarationsFor('.cm-editor .cm-image-source'))
            .toMatch(/var\(--accent-color\)/);
    });

    test('keeps the frontmatter disclosure aligned while its panel changes height', () => {
        expect(declarationsFor('.cm-scroller')).toMatch(/scrollbar-gutter:\s*stable/);
        expect(declarationsFor('.cm-frontmatter-disclosure')).toMatch(/width:\s*16px/);
        expect(declarationsFor('.cm-frontmatter-disclosure')).toMatch(/transition:\s*transform/);
        expect(declarationsFor('.cm-frontmatter-disclosure.expanded')).toMatch(/rotate\(90deg\)/);
    });

    test('top-aligns Markdown block guides and provides fold-anchor scroll space', () => {
        expect(declarationsFor('.cm-editorHelperRail .cm-gutterElement'))
            .toMatch(/align-items:\s*flex-start/);
        const leftGuideRail = declarationsFor('.cm-editorHelperRail-before .cm-gutterElement');
        expect(leftGuideRail).toMatch(/justify-content:\s*flex-end/);
        expect(declarationsFor('#editor-container .cm-editorHelperRail-before .ui-editor-block-guide'))
            .toMatch(/justify-items:\s*end/);
        expect(declarationsFor('#editor-container .cm-editorHelperRail-before .ui-editor-block-guide'))
            .toMatch(/text-align:\s*right/);
        expect(declarationsFor('.cm-editorHelperRail-before'))
            .toMatch(/margin-right:\s*calc\(0px - var\(--editor-block-before-rail-width, 0px\)\)/);
        expect(declarationsFor('.cm-editorHelperRail-before'))
            .toMatch(/translate\(var\(--editor-block-before-rail-offset, 0px\), -16px\)/);
        expect(declarationsFor('.cm-markdownBlockGuideSpacer')).toMatch(/padding:\s*0 6px/);
        expect(declarationsFor('.cm-editor-block-guide-stack')).toMatch(/display:\s*grid/);
        expect(declarationsFor('.cm-editor-block-guide-stack')).toMatch(/justify-items:\s*end/);
        expect(declarationsFor('.cm-editor-block-guide-stack')).toMatch(/gap:\s*0/);
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
