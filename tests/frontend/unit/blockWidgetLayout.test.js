import fs from 'node:fs';
import path from 'node:path';
import { markBlockWidget, wrapBlockWidget } from '../frontend/js/blockWidget.js';
import { readApplicationStyles } from '../support/styleSources.js';

const stylesheet = readApplicationStyles();
const editorSource = fs.readFileSync(path.resolve('frontend/js/editor.js'), 'utf8');

function declarationsFor(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = stylesheet.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
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
        expect(declarationsFor('.cm-block-widget--table')).toMatch(/padding:\s*4px 0/);
        expect(declarationsFor('.cm-live-table')).toMatch(/width:\s*100%/);
        expect(declarationsFor('.cm-live-table')).toMatch(/height:\s*100%/);
        expect(declarationsFor('.cm-live-table')).toMatch(/overflow:\s*auto/);
        expect(declarationsFor('.cm-live-table')).toMatch(/font-size:\s*\.9em/);
        expect(declarationsFor('.cm-live-table')).toMatch(/line-height:\s*1\.4/);
        expect(declarationsFor('.cm-live-table')).toMatch(/padding:\s*6px/);
        expect(declarationsFor('.cm-live-table')).toMatch(/scrollbar-gutter:\s*stable/);
        expect(declarationsFor('.cm-live-table')).toMatch(/background:\s*var\(--panel-bg\)/);
        expect(declarationsFor('.cm-live-table')).toMatch(/border-radius:\s*8px/);
        expect(declarationsFor('.cm-live-table')).not.toMatch(/(?:^|;)\s*border\s*:/);
        expect(declarationsFor('.cm-source-footprint--scroll.cm-block-widget--table'))
            .toMatch(/overflow:\s*hidden\s*!important/);
        expect(declarationsFor('.cm-live-table th,\n.cm-live-table td')).toMatch(/padding:\s*3px 7px/);
        expect(declarationsFor('.cm-live-table table')).toMatch(/border-collapse:\s*collapse/);
    });

    test('stacks approved Outline, Raw, and PDF icon buttons in one editor launcher rail', () => {
        const launchers = declarationsFor('.editor-navigation-launchers');
        expect(launchers).toMatch(/display:\s*flex/);
        expect(launchers).toMatch(/flex-direction:\s*column/);
        expect(launchers).toMatch(/gap:\s*4px/);
        const launcher = declarationsFor('.editor-navigation-launcher');
        expect(launcher).toMatch(/width:\s*28px/);
        expect(launcher).toMatch(/height:\s*28px/);
        expect(launcher).toMatch(/background:\s*color-mix\(in srgb, var\(--panel-bg\)/);
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
        expect(stylesheet).not.toContain('Markdown footprint');
        expect(declarationsFor('.cm-source-footprint[data-source-footprint-state="underflow"]::after'))
            .toMatch(/content:\s*none/);
        expect(declarationsFor('.cm-live-diagram')).toMatch(/height:\s*100%/);
        expect(declarationsFor('.cm-live-diagram-view')).toMatch(/min-height:\s*0/);
        expect(declarationsFor('.cm-codeblock-widget'))
            .toMatch(/tab-size:\s*var\(--editor-tab-size, 4\)/);
        expect(declarationsFor('.cm-codeblock-widget')).toMatch(/border:\s*0\s*!important/);
        expect(declarationsFor('.cm-codeblock-widget')).toMatch(/border-radius:\s*8px\s*!important/);
        expect(editorSource).toMatch(/'\.cm-codeblock-widget':\s*\{[^}]*borderRadius:\s*'8px !important'/);
        expect(editorSource).not.toMatch(/'\.cm-codeblock-widget':\s*\{[^}]*borderRadius:\s*'0 !important'/);
        expect(declarationsFor('.cm-codeblock-widget pre'))
            .toMatch(/overflow:\s*visible\s*!important/);
        expect(declarationsFor('.cm-codeblock-widget .cm-codeblock-fence'))
            .toMatch(/display:\s*none\s*!important/);
        expect(declarationsFor('.cm-codeblock-line-numbers .cm-codeblock-line:not(.cm-codeblock-fence)::before'))
            .toMatch(/content:\s*counter\(code-block-line\)/);
        expect(declarationsFor('.cm-codeblock-line-numbers .cm-codeblock-line:not(.cm-codeblock-fence)::before'))
            .toMatch(/border-right:\s*0/);
        expect(declarationsFor('.cm-codeblock-copy')).toMatch(/opacity:\s*0/);
        expect(declarationsFor('.cm-codeblock-copy')).toMatch(/pointer-events:\s*none/);
    });

    test('centers full-width diagrams and anchors their vertical resize handle to the canvas edge', () => {
        const liveView = declarationsFor('.cm-live-diagram-view');
        expect(liveView).toMatch(/align-items:\s*center/);
        expect(liveView).toMatch(/justify-content:\s*center/);
        const chartGraphic = declarationsFor('.cm-block-widget--figaro-chart .cm-live-diagram-view svg');
        expect(chartGraphic).toMatch(/width:\s*100%\s*!important/);
        expect(chartGraphic).toMatch(/max-height:\s*100%\s*!important/);
        expect(declarationsFor('.cm-block-widget--figaro-chart .cm-live-diagram'))
            .toMatch(/background:\s*var\(--editor-surface\)/);
        const handle = declarationsFor('.ui-image-resize-handle.cm-diagram-resize-handle');
        expect(handle).toMatch(/position:\s*absolute/);
        expect(handle).toMatch(/bottom:\s*-6px/);
        expect(handle).toMatch(/left:\s*calc\(50% - 14px\)/);
        expect(handle).toMatch(/cursor:\s*ns-resize/);
        const sourceLine = declarationsFor('.cm-editor .cm-diagram-source-line');
        expect(sourceLine).toMatch(/overflow-wrap:\s*normal/);
        expect(sourceLine).toMatch(/white-space:\s*pre/);
        expect(declarationsFor('.cm-editor .cm-diagram-source-placeholder'))
            .toMatch(/min-height:\s*var\(--cm-diagram-source-height\)\s*!important/);
        const mermaidGraphic = declarationsFor('.cm-block-widget--resizable-mermaid .cm-live-diagram-view svg');
        expect(mermaidGraphic).toMatch(/width:\s*100%\s*!important/);
        expect(mermaidGraphic).toMatch(/height:\s*100%\s*!important/);

        const workspace = declarationsFor('.vega-lite-chart-editor-workspace');
        expect(workspace).toMatch(/grid-template-columns:\s*minmax\(330px, \.68fr\) minmax\(540px, 1\.62fr\)/);
        const preview = declarationsFor('.vega-lite-chart-editor-preview');
        expect(preview).toMatch(/align-items:\s*center/);
        expect(preview).toMatch(/justify-content:\s*center/);
        expect(preview).toMatch(/background:\s*var\(--editor-surface\)/);
        expect(preview).toMatch(/color:\s*var\(--text-color\)/);
        expect(declarationsFor('.vega-lite-chart-editor-preview > svg'))
            .toMatch(/max-height:\s*100%\s*!important/);
        expect(declarationsFor('.vega-lite-chart-editor-config .vega-lite-chart-editor-combobox'))
            .toMatch(/width:\s*100%/);
        expect(declarationsFor('.vega-lite-chart-editor-column-extra'))
            .toMatch(/white-space:\s*nowrap/);
        expect(stylesheet).not.toContain('.vega-lite-chart-editor-trendline-help');
        expect(stylesheet).not.toContain('.vega-lite-chart-editor-column-extra.is-disabled > span');
        expect(declarationsFor('.vega-lite-chart-editor-color-button.ui-icon-button'))
            .toMatch(/width:\s*30px[\s\S]*height:\s*30px/);
        expect(declarationsFor('.vega-lite-chart-editor-threshold-stepper'))
            .toMatch(/width:\s*104px/);
        expect(declarationsFor('.vega-lite-chart-editor-section + .vega-lite-chart-editor-section'))
            .not.toMatch(/border/);
        expect(declarationsFor('.vega-lite-chart-editor-section[data-columns-section]'))
            .not.toMatch(/border/);
        expect(declarationsFor('.vega-lite-chart-editor-preview-pane'))
            .toMatch(/border:\s*0/);
        expect(stylesheet).toMatch(/\.vega-lite-chart-editor-preview-heading\s*\{[^}]*border-bottom:\s*0/);
        expect(declarationsFor('.vega-lite-chart-editor-visibility.ui-icon-button'))
            .toMatch(/width:\s*24px[\s\S]*height:\s*24px/);
        expect(declarationsFor('.vega-lite-chart-editor-preview-error')).toMatch(/display:\s*grid/);
        expect(stylesheet).toMatch(/@container\s+chart-config\s+\(max-width:\s*380px\)/);
        expect(stylesheet).toMatch(/grid-template-areas:\s*\n\s*"use column mark"/);
        expect(stylesheet).toMatch(/grid-template-columns:\s*24px minmax\(0, 1fr\) minmax\(132px, 150px\)/);
    });

    test('allows scrollable code footprints to chain vertical wheel input at their limits', () => {
        const scrollSurface = declarationsFor('.cm-source-footprint--scroll');
        expect(scrollSurface).toMatch(/overflow:\s*auto\s*!important/);
        expect(scrollSurface).toMatch(/overscroll-behavior:\s*auto/);
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
        const resizeFrame = declarationsFor('.cm-editor .cm-image-resize-frame');
        expect(resizeFrame).toMatch(/margin:\s*0/);
        expect(resizeFrame).toMatch(/border:\s*0/);
        expect(resizeFrame).toMatch(/touch-action:\s*none/);
        expect(declarationsFor('.cm-editor .cm-image-resize-frame img'))
            .toMatch(/height:\s*100%/);
        expect(declarationsFor('.ui-image-resize-handle'))
            .toMatch(/width:\s*28px/);
        expect(declarationsFor('.ui-image-resize-handle'))
            .toMatch(/height:\s*28px/);
        expect(declarationsFor('.cm-editor .cm-image-source-placeholder'))
            .toMatch(/min-height:\s*var\(--cm-image-source-height\)\s*!important/);
        expect(declarationsFor('.cm-editor .cm-image-widget.is-resizing .cm-image-resize-readout'))
            .toMatch(/display:\s*block/);
        const drawioAction = declarationsFor('.cm-editor .cm-drawio-action-button');
        expect(drawioAction).toMatch(/height:\s*1\.65em/);
        expect(drawioAction).toMatch(/width:\s*100%/);
    });

    test('keeps the frontmatter disclosure aligned while its panel changes height', () => {
        expect(declarationsFor('.cm-scroller')).toMatch(/scrollbar-gutter:\s*stable/);
        expect(declarationsFor('.cm-frontmatter-disclosure')).toMatch(/width:\s*16px/);
        expect(declarationsFor('.cm-frontmatter-disclosure')).toMatch(/transition:\s*transform/);
        expect(declarationsFor('.cm-frontmatter-disclosure.expanded')).toMatch(/rotate\(90deg\)/);
        expect(declarationsFor('.cm-frontmatter')).toMatch(/border:\s*0/);
        expect(declarationsFor('.cm-frontmatter')).toMatch(/border-radius:\s*8px/);
        expect(declarationsFor('.cm-frontmatter')).toMatch(/background:\s*var\(--hover-bg\)/);
        expect(declarationsFor('.cm-frontmatter')).toMatch(/box-shadow:\s*none/);
        expect(declarationsFor('.cm-frontmatter-panel')).toMatch(/border:\s*0/);
        expect(declarationsFor('.cm-frontmatter-panel')).toMatch(/border-radius:\s*8px/);
        expect(declarationsFor('.cm-frontmatter-panel')).toMatch(/background:\s*var\(--hover-bg\)/);
        expect(declarationsFor('.cm-frontmatter-panel')).toMatch(/box-shadow:\s*none/);
        expect(declarationsFor('.cm-frontmatter-chip,\n.cm-frontmatter-more'))
            .toMatch(/background:\s*transparent/);
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
        expect(declarationsFor('.cm-editor-block-guide-stack')).toMatch(/pointer-events:\s*none/);
        expect(declarationsFor('.cm-task-action-guide')).toMatch(/display:\s*flex/);
        expect(declarationsFor('.cm-task-action-guide')).toMatch(/gap:\s*2px/);
        expect(declarationsFor('.cm-task-action-guide')).toMatch(/pointer-events:\s*auto/);
        expect(declarationsFor('.cm-task-action-guide svg')).toMatch(/width:\s*13px/);
        expect(declarationsFor('.cm-task-action-guide svg')).toMatch(/height:\s*13px/);
        expect(declarationsFor('.ui-editor-block-guide')).toMatch(/opacity:\s*0/);
        expect(declarationsFor('.ui-editor-block-guide')).toMatch(/pointer-events:\s*none/);
        expect(declarationsFor('.ui-editor-fold-control[aria-expanded=\'false\'],\n.ui-editor-block-guide[aria-expanded=\'false\']'))
            .toMatch(/opacity:\s*1/);
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
