/**
 * How a live diagram widget is sized. The widget owns rendering, caching and
 * the pointer gesture; a presentation owns its geometry:
 *
 * - Mermaid draws at its natural or authored size in a box that grows to the
 *   taller of the drawing and its source lines.
 * - A managed Vega-Lite chart fills a fixed authored-height box.
 * - Any other diagram scales down to fit its source footprint.
 *
 * Sizing decisions live in the pure models; these adapters apply them to DOM.
 */
import { fitGraphicToSourceFootprint } from './sourceFootprint.js';
import { diagramSizeKey, svgViewBoxSize } from './core/diagramSizeModel.js';
import {
    MERMAID_WIDGET_CHROME_HEIGHT,
    authoredMermaidDiagramHeight,
    mermaidDiagramDisplaySize,
    mermaidDiagramHeight,
    mermaidDiagramResizePlan,
    mermaidSourceWithoutHeight,
    normalizeMermaidDiagramHeight,
    setMermaidDiagramHeight,
} from './core/mermaidDiagramModel.js';
import { mermaidUsesApplicationTheme } from './core/mermaidStyleEditorModel.js';
import {
    setVegaLiteChartHeight,
    vegaLiteChartHeight,
    vegaLiteChartResizePlan,
} from './core/vegaLiteChartEditorModel.js';

const MANAGED_CHART_CHROME_HEIGHT = 44;
const SIZE_KEY_CACHE_LIMIT = 128;
const sizeKeyCache = new Map();

/**
 * Size keys for a Mermaid source. The drawing ignores the editor-only height
 * directive, so its natural size survives a resize; the editor box depends on
 * the complete source. Reveal toggles ask for the same keys repeatedly, so a
 * small memo avoids rehashing sources of up to 50,000 characters.
 */
export function mermaidSizeKeys(code) {
    let keys = sizeKeyCache.get(code);
    if (keys) {
        sizeKeyCache.delete(code);
    } else {
        keys = {
            natural: diagramSizeKey('mermaid', mermaidSourceWithoutHeight(code)),
            box: diagramSizeKey('mermaid', code),
        };
        if (sizeKeyCache.size >= SIZE_KEY_CACHE_LIMIT) sizeKeyCache.delete(sizeKeyCache.keys().next().value);
    }
    sizeKeyCache.set(code, keys);
    return keys;
}

/**
 * Height of the box a Mermaid widget occupies: the measured box of its last
 * mount at the current layout, a height inherited from the edited block it
 * replaced, or an estimate from the remembered drawing size.
 */
export function mermaidBoxHeight(sizeMemory, code, inheritedHeight = 0) {
    const keys = mermaidSizeKeys(code);
    const measured = sizeMemory.boxHeight(keys.box);
    if (measured) return measured;
    if (inheritedHeight) return inheritedHeight;
    const display = mermaidDiagramDisplaySize({
        natural: sizeMemory.naturalSize(keys.natural),
        authoredHeight: authoredMermaidDiagramHeight(code),
    });
    return Math.round(display?.height ?? mermaidDiagramHeight(code)) + MERMAID_WIDGET_CHROME_HEIGHT;
}

/** Revealed-source height for a block, or 0 when it keeps plain source lines. */
export function diagramSourceBoxHeight(sizeMemory, block) {
    if (block.lang === 'mermaid') return mermaidBoxHeight(sizeMemory, block.code, block.boxHint);
    const chartHeight = block.lang === 'vega-lite' ? vegaLiteChartHeight(block.rawCode ?? block.code) : null;
    return chartHeight ? chartHeight + MANAGED_CHART_CHROME_HEIGHT : 0;
}

class FittedPresentation {
    constructor() {
        this.resizable = false;
        this.appearance = 'authored';
        this.deferDuringKeyRepeat = false;
    }

    mount(wrapper, content) {
        return { target: content, anchor: wrapper };
    }

    settle(root, container, graphic) {
        return fitGraphicToSourceFootprint(root, container, graphic);
    }

    fail() {}
}

class ChartPresentation extends FittedPresentation {
    constructor(height) {
        super();
        this.resizable = true;
        this.appearance = 'application';
        this.label = 'Resize chart vertically';
        this.kind = 'vega-lite-chart';
        this.userEvent = 'chart.resize';
        this.viewClass = 'cm-vega-lite-chart-resizing';
        this.height = height;
    }

    mount(wrapper, content) {
        wrapper.classList.add('cm-block-widget--resizable-diagram', 'cm-block-widget--figaro-chart');
        return { target: content, anchor: wrapper };
    }

    initialize(root) {
        this.apply(root, this.height);
    }

    apply(root, height) {
        const normalized = vegaLiteChartResizePlan({ startHeight: height, deltaY: 0 });
        root.dataset.figaroDiagramHeight = String(normalized);
        root.dataset.figaroChartHeight = String(normalized);
        root.style.setProperty('--cm-source-footprint-height', `${normalized + MANAGED_CHART_CHROME_HEIGHT}px`);
        root.querySelector('.cm-diagram-resize-readout').textContent = `${normalized}px high`;
        return normalized;
    }

    start() {
        return { height: this.height, maxHeight: Infinity };
    }

    plan(startHeight, deltaY) {
        return vegaLiteChartResizePlan({ startHeight, deltaY });
    }

    restore(root) {
        this.apply(root, this.height);
    }

    replacement(source, height) {
        return setVegaLiteChartHeight(source, height);
    }
}

class MermaidPresentation {
    constructor(code, sizeMemory, boxHint) {
        this.resizable = true;
        this.appearance = 'application';
        // Attaching Mermaid SVG costs substantial layout during native key
        // repeat, so prepared previews wait for the burst to end.
        this.deferDuringKeyRepeat = true;
        this.label = 'Resize Mermaid diagram vertically';
        this.kind = 'mermaid-diagram';
        this.userEvent = 'diagram.resize';
        this.viewClass = null;
        this.code = code;
        this.sizeMemory = sizeMemory;
        this.boxHint = boxHint;
        this.defaultHeight = mermaidDiagramHeight(code);
        this.authoredHeight = authoredMermaidDiagramHeight(code);
        this.keys = mermaidSizeKeys(code);
        this.boxObserver = null;
    }

    natural() {
        return this.sizeMemory.naturalSize(this.keys.natural);
    }

    /** Mermaid draws into a canvas sized to the drawing, holding the handle. */
    mount(wrapper, content) {
        wrapper.classList.add('cm-block-widget--mermaid', 'cm-block-widget--resizable-diagram',
            'cm-block-widget--resizable-mermaid');
        if (mermaidUsesApplicationTheme(this.code)) wrapper.classList.add('cm-block-widget--application-mermaid');
        // Revealed Mermaid source never wraps, so its height is its line
        // count; the drawing may make the box taller.
        wrapper.dataset.sourceFootprintWrap = 'none';
        const canvas = document.createElement('div');
        canvas.className = 'cm-live-diagram-canvas';
        canvas.dataset.diagramState = 'pending';
        const target = document.createElement('div');
        target.className = 'cm-live-diagram-graphic';
        canvas.append(target);
        content.append(canvas);
        return { target, anchor: canvas };
    }

    initialize(root) {
        this.apply(root, this.authoredHeight);
        if (this.boxHint && !this.natural()) root.style.setProperty('--cm-diagram-box-hint', `${this.boxHint}px`);
    }

    /**
     * Draw at the natural or authored size; the box grows to fit and the
     * drawing stays centered. Until the natural size is known the drawing
     * reserves its authored or default height.
     */
    apply(root, height) {
        const natural = this.natural();
        const display = mermaidDiagramDisplaySize({ natural, authoredHeight: height });
        const shown = display?.height ?? normalizeMermaidDiagramHeight(height ?? this.defaultHeight);
        root.dataset.figaroDiagramHeight = String(Math.round(shown));
        if (display) {
            root.style.setProperty('--figaro-diagram-width', `${display.width}px`);
            root.style.setProperty('--figaro-diagram-aspect', `${natural.width} / ${natural.height}`);
            root.style.removeProperty('--figaro-diagram-pending-height');
        } else {
            root.style.removeProperty('--figaro-diagram-width');
            root.style.removeProperty('--figaro-diagram-aspect');
            root.style.setProperty('--figaro-diagram-pending-height', `${shown}px`);
        }
        const readout = root.querySelector('.cm-diagram-resize-readout');
        if (readout) readout.textContent = `${Math.round(shown)}px high`;
        return shown;
    }

    /** Current drawing height and the tallest the column can show. */
    start(root) {
        const graphic = root.querySelector('.cm-live-diagram-graphic > svg');
        const drawn = graphic?.getBoundingClientRect().height;
        const height = drawn > 0 ? Math.round(drawn) : Number(root.dataset.figaroDiagramHeight) || this.defaultHeight;
        const natural = this.natural();
        const view = root.querySelector('.cm-live-diagram-view');
        let maxHeight = Infinity;
        if (natural && view) {
            const style = getComputedStyle(view);
            const width = view.clientWidth - (Number.parseFloat(style.paddingLeft) || 0)
                - (Number.parseFloat(style.paddingRight) || 0);
            if (width > 0) maxHeight = width * natural.height / natural.width;
        }
        return { height, maxHeight };
    }

    plan(startHeight, deltaY, maxHeight) {
        return mermaidDiagramResizePlan({ startHeight, deltaY, maxHeight });
    }

    restore(root) {
        this.apply(root, this.authoredHeight);
    }

    replacement(source, height, lineBreak) {
        return setMermaidDiagramHeight(source, height, lineBreak);
    }

    /**
     * Size the box from the drawing, remember the drawing's natural size for
     * later mounts, and keep the measured box for revealed source.
     */
    settle(root, _container, graphic) {
        const natural = svgViewBoxSize(graphic.getAttribute('viewBox'));
        if (natural) this.sizeMemory.rememberNaturalSize(this.keys.natural, natural);
        this.apply(root, this.authoredHeight);
        root.style.removeProperty('--cm-diagram-box-hint');
        this.setState(root, 'ready');
        root.dataset.sourceFootprintState = 'fit';
        if (this.boxObserver || typeof ResizeObserver !== 'function') return () => this.disconnect();
        this.boxObserver = new ResizeObserver(entries => {
            const entry = entries.at(-1);
            const height = entry?.borderBoxSize?.[0]?.blockSize ?? root.getBoundingClientRect().height;
            if (height > 0) this.sizeMemory.rememberBoxHeight(this.keys.box, height);
        });
        this.boxObserver.observe(root);
        return () => this.disconnect();
    }

    disconnect() {
        this.boxObserver?.disconnect();
        this.boxObserver = null;
    }

    fail(root) {
        this.setState(root, 'error');
    }

    setState(root, state) {
        const canvas = root.querySelector('.cm-live-diagram-canvas');
        if (canvas && canvas.dataset.diagramState !== state) canvas.dataset.diagramState = state;
        if (state === 'error') root.style.removeProperty('--cm-diagram-box-hint');
    }
}

/** Choose the presentation for a diagram widget. */
export function createDiagramPresentation({ lang, code, sizeMemory, boxHint = 0 }) {
    if (lang === 'mermaid') return new MermaidPresentation(code, sizeMemory, boxHint);
    const chartHeight = lang === 'vega-lite' ? vegaLiteChartHeight(code) : null;
    return chartHeight ? new ChartPresentation(chartHeight) : new FittedPresentation();
}
