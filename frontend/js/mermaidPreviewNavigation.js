import {
    mermaidPreviewPanBy,
    mermaidPreviewWheelZoom,
    mermaidPreviewZoomAt,
} from './core/mermaidEditorModel.js';

const resetTransform = Object.freeze({ scale: 1, x: 0, y: 0 });

function normalizedWheelDelta(event, viewportHeight) {
    if (event.deltaMode === 1) return event.deltaY * 16;
    if (event.deltaMode === 2) return event.deltaY * viewportHeight;
    return event.deltaY;
}

/** Own pointer/keyboard effects for the otherwise pure Mermaid preview transform. */
export function createMermaidPreviewNavigation(viewport, { emptyElement = null } = {}) {
    const canvas = document.createElement('div');
    canvas.className = 'mermaid-editor-preview-canvas';
    canvas.hidden = true;
    viewport.append(canvas);
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-label', 'Interactive Mermaid preview');
    viewport.title = 'Mouse wheel to zoom · drag to pan · 0 to reset';

    let transform = { ...resetTransform };
    let drag = null;
    let fittedSize = null;

    const publish = () => {
        const svg = canvas.firstElementChild;
        if (svg && fittedSize) {
            svg.style.width = `${fittedSize.width * transform.scale}px`;
            svg.style.height = `${fittedSize.height * transform.scale}px`;
            svg.style.left = `calc(50% + ${transform.x}px)`;
            svg.style.top = `calc(50% + ${transform.y}px)`;
        }
        canvas.dataset.zoom = transform.scale.toFixed(4);
        canvas.dataset.panX = transform.x.toFixed(2);
        canvas.dataset.panY = transform.y.toFixed(2);
    };
    const center = () => ({ x: 0, y: 0 });
    const fitSVG = () => {
        const svg = canvas.firstElementChild;
        if (!svg) return;
        canvas.classList.remove('is-sized');
        svg.style.removeProperty('width');
        svg.style.removeProperty('height');
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) fittedSize = { width: rect.width, height: rect.height };
        canvas.classList.add('is-sized');
        publish();
    };
    const reset = () => {
        transform = { ...resetTransform };
        publish();
    };
    const setSVG = svg => {
        canvas.innerHTML = svg;
        canvas.hidden = false;
        viewport.classList.add('has-preview');
        emptyElement?.remove();
        fitSVG();
    };
    const onWheel = event => {
        if (!canvas.firstElementChild || event.deltaY === 0) return;
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        transform = mermaidPreviewWheelZoom(
            transform,
            normalizedWheelDelta(event, rect.height),
            {
                x: event.clientX - rect.left - (rect.width / 2),
                y: event.clientY - rect.top - (rect.height / 2),
            },
        );
        publish();
    };
    const stopDrag = event => {
        if (!drag || (event && event.pointerId !== drag.pointerId)) return;
        if (viewport.hasPointerCapture?.(drag.pointerId)) viewport.releasePointerCapture(drag.pointerId);
        drag = null;
        viewport.classList.remove('is-panning');
    };
    const onPointerDown = event => {
        if (event.button !== 0 || !canvas.firstElementChild) return;
        event.preventDefault();
        viewport.focus({ preventScroll: true });
        drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        viewport.setPointerCapture?.(event.pointerId);
        viewport.classList.add('is-panning');
    };
    const onPointerMove = event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        transform = mermaidPreviewPanBy(transform, {
            x: event.clientX - drag.x,
            y: event.clientY - drag.y,
        });
        drag = { ...drag, x: event.clientX, y: event.clientY };
        publish();
    };
    const onKeydown = event => {
        if (!canvas.firstElementChild) return;
        const zoomFactor = event.key === '+' || event.key === '=' ? 1.2
            : event.key === '-' || event.key === '_' ? 1 / 1.2
                : null;
        if (zoomFactor) transform = mermaidPreviewZoomAt(transform, transform.scale * zoomFactor, center());
        else if (event.key === '0') reset();
        else if (event.key === 'ArrowLeft') transform = mermaidPreviewPanBy(transform, { x: -24 });
        else if (event.key === 'ArrowRight') transform = mermaidPreviewPanBy(transform, { x: 24 });
        else if (event.key === 'ArrowUp') transform = mermaidPreviewPanBy(transform, { y: -24 });
        else if (event.key === 'ArrowDown') transform = mermaidPreviewPanBy(transform, { y: 24 });
        else return;
        event.preventDefault();
        publish();
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', stopDrag);
    viewport.addEventListener('pointercancel', stopDrag);
    viewport.addEventListener('keydown', onKeydown);
    const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => fitSVG())
        : null;
    resizeObserver?.observe(viewport);
    publish();

    return {
        canvas,
        setSVG,
        reset,
        destroy() {
            viewport.removeEventListener('wheel', onWheel);
            viewport.removeEventListener('pointerdown', onPointerDown);
            viewport.removeEventListener('pointermove', onPointerMove);
            viewport.removeEventListener('pointerup', stopDrag);
            viewport.removeEventListener('pointercancel', stopDrag);
            viewport.removeEventListener('keydown', onKeydown);
            resizeObserver?.disconnect();
            stopDrag();
        },
        get transform() { return { ...transform }; },
    };
}

export default createMermaidPreviewNavigation;
