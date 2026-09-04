import {
    editorModalResizeKeyboardDelta,
    editorModalResizePlan,
    editorModalViewportPlan,
} from './core/editorModalResizeModel.js';

let resizeSequence = 0;

function pixel(value) {
    return `${Math.round(value)}px`;
}

/**
 * Add one pointer- and keyboard-operable resize boundary to an editor modal.
 * Geometry decisions remain in the pure model; this adapter owns DOM effects.
 */
export function makeEditorModalResizable(modal, {
    minimumWidth = 480,
    minimumHeight = 360,
    viewportMargin = 24,
} = {}) {
    if (!(modal instanceof HTMLElement)) return null;

    const originalStyle = new Map([
        ['position', modal.style.getPropertyValue('position')],
        ['left', modal.style.getPropertyValue('left')],
        ['top', modal.style.getPropertyValue('top')],
        ['width', modal.style.getPropertyValue('width')],
        ['height', modal.style.getPropertyValue('height')],
        ['max-width', modal.style.getPropertyValue('max-width')],
        ['max-height', modal.style.getPropertyValue('max-height')],
        ['margin', modal.style.getPropertyValue('margin')],
    ]);
    const readoutId = `editor-modal-resize-${++resizeSequence}`;
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'ui-image-resize-handle custom-modal-resize-handle';
    handle.dataset.uiTooltip = 'Resize editor dialog · drag or use Arrow keys · Home resets';
    handle.setAttribute('aria-label', 'Resize editor dialog');
    handle.setAttribute('aria-describedby', readoutId);
    handle.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Home');
    const readout = document.createElement('output');
    readout.id = readoutId;
    readout.className = 'custom-modal-resize-readout';
    readout.setAttribute('aria-live', 'polite');
    readout.textContent = 'Default size';
    modal.classList.add('custom-modal--resizable');
    modal.append(handle, readout);

    let activeResize = null;
    let keyboardReadoutTimer = 0;
    let destroyed = false;

    const viewport = () => ({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        margin: viewportMargin,
        minimumWidth,
        minimumHeight,
    });
    const updateReadout = geometry => {
        readout.textContent = `${geometry.width} × ${geometry.height}px`;
    };
    const applyGeometry = geometry => {
        modal.style.position = 'fixed';
        modal.style.left = pixel(geometry.left);
        modal.style.top = pixel(geometry.top);
        modal.style.width = pixel(geometry.width);
        modal.style.height = pixel(geometry.height);
        modal.style.maxWidth = 'none';
        modal.style.maxHeight = 'none';
        modal.style.margin = '0';
        modal.classList.add('is-user-sized');
        updateReadout(geometry);
        return geometry;
    };
    const measuredGeometry = () => {
        const bounds = modal.getBoundingClientRect();
        return editorModalViewportPlan({
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
            ...viewport(),
        });
    };
    const currentGeometry = () => {
        if (!modal.classList.contains('is-user-sized')) return measuredGeometry();
        return editorModalViewportPlan({
            left: Number.parseFloat(modal.style.left),
            top: Number.parseFloat(modal.style.top),
            width: Number.parseFloat(modal.style.width),
            height: Number.parseFloat(modal.style.height),
            ...viewport(),
        });
    };
    const pinCurrentGeometry = () => applyGeometry(currentGeometry());
    const restoreDefault = () => {
        for (const [property, value] of originalStyle) {
            if (value) modal.style.setProperty(property, value);
            else modal.style.removeProperty(property);
        }
        modal.classList.remove('is-user-sized');
        readout.textContent = 'Default size';
    };
    const stopKeyboardReadout = () => {
        clearTimeout(keyboardReadoutTimer);
        keyboardReadoutTimer = 0;
        modal.classList.remove('is-keyboard-resizing');
    };
    const showKeyboardReadout = () => {
        stopKeyboardReadout();
        modal.classList.add('is-keyboard-resizing');
        keyboardReadoutTimer = setTimeout(stopKeyboardReadout, 900);
    };
    const removeDragListeners = () => {
        document.removeEventListener('pointermove', moveResize, true);
        document.removeEventListener('pointerup', finishResize, true);
        document.removeEventListener('pointercancel', cancelResize, true);
        window.removeEventListener('keydown', cancelResizeOnEscape, true);
        window.removeEventListener('blur', cancelResize);
    };
    const completeResize = (event, commit) => {
        if (!activeResize) return false;
        if (Number.isInteger(event?.pointerId) && event.pointerId !== activeResize.pointerId) return false;
        const previous = activeResize;
        activeResize = null;
        removeDragListeners();
        modal.classList.remove('is-resizing');
        document.body.classList.remove('custom-modal-resizing');
        handle.dataset.uiTooltip = previous.tooltip;
        if (!commit || !previous.moved) {
            if (previous.wasUserSized) applyGeometry(previous.geometry);
            else restoreDefault();
        }
        if (handle.hasPointerCapture?.(previous.pointerId)) handle.releasePointerCapture(previous.pointerId);
        if (!destroyed && handle.isConnected) handle.focus({ preventScroll: true });
        return true;
    };
    function moveResize(event) {
        if (!activeResize || event.pointerId !== activeResize.pointerId) return;
        event.preventDefault();
        const geometry = editorModalResizePlan({
            startWidth: activeResize.geometry.width,
            startHeight: activeResize.geometry.height,
            deltaX: event.clientX - activeResize.clientX,
            deltaY: event.clientY - activeResize.clientY,
            minimumWidth,
            minimumHeight,
            maximumWidth: window.innerWidth - viewportMargin - activeResize.geometry.left,
            maximumHeight: window.innerHeight - viewportMargin - activeResize.geometry.top,
        });
        activeResize.moved = activeResize.moved
            || geometry.width !== activeResize.geometry.width
            || geometry.height !== activeResize.geometry.height;
        applyGeometry({ ...activeResize.geometry, ...geometry });
    }
    function finishResize(event) {
        completeResize(event, true);
    }
    function cancelResize(event) {
        completeResize(event, false);
    }
    function cancelResizeOnEscape(event) {
        if (event.key !== 'Escape' || !activeResize) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        completeResize(event, false);
    }

    handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || destroyed) return;
        event.preventDefault();
        event.stopPropagation();
        stopKeyboardReadout();
        const wasUserSized = modal.classList.contains('is-user-sized');
        const geometry = pinCurrentGeometry();
        activeResize = {
            clientX: event.clientX,
            clientY: event.clientY,
            geometry,
            pointerId: event.pointerId,
            tooltip: handle.dataset.uiTooltip,
            wasUserSized,
            moved: false,
        };
        handle.removeAttribute('data-ui-tooltip');
        modal.classList.add('is-resizing');
        document.body.classList.add('custom-modal-resizing');
        try { handle.setPointerCapture?.(event.pointerId); } catch { /* Older webviews may reject capture. */ }
        document.addEventListener('pointermove', moveResize, true);
        document.addEventListener('pointerup', finishResize, true);
        document.addEventListener('pointercancel', cancelResize, true);
        window.addEventListener('keydown', cancelResizeOnEscape, true);
        window.addEventListener('blur', cancelResize);
    });
    handle.addEventListener('lostpointercapture', cancelResize);
    handle.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'Home') {
            event.preventDefault();
            event.stopPropagation();
            restoreDefault();
            showKeyboardReadout();
            return;
        }
        const delta = editorModalResizeKeyboardDelta(event.key, event.shiftKey ? 8 : 24);
        if (!delta) return;
        event.preventDefault();
        event.stopPropagation();
        const geometry = pinCurrentGeometry();
        const size = editorModalResizePlan({
            startWidth: geometry.width,
            startHeight: geometry.height,
            ...delta,
            minimumWidth,
            minimumHeight,
            maximumWidth: window.innerWidth - viewportMargin - geometry.left,
            maximumHeight: window.innerHeight - viewportMargin - geometry.top,
        });
        applyGeometry({ ...geometry, ...size });
        showKeyboardReadout();
    });

    const fitViewport = () => {
        if (!modal.classList.contains('is-user-sized')) return;
        applyGeometry(currentGeometry());
    };
    window.addEventListener('resize', fitViewport);

    return {
        handle,
        readout,
        reset: restoreDefault,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            completeResize(null, false);
            stopKeyboardReadout();
            window.removeEventListener('resize', fitViewport);
            handle.removeEventListener('lostpointercapture', cancelResize);
            handle.remove();
            readout.remove();
            modal.classList.remove('custom-modal--resizable', 'is-user-sized');
            restoreDefault();
        },
    };
}

export default makeEditorModalResizable;
