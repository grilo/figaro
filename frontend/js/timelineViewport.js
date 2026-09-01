import {
    CALENDAR_TIMELINE_PREFETCH_DAYS,
    calendarTimelineEdgeDirection,
    calendarTimelinePanPlan,
    calendarTimelineWheelPlan,
    timelineScrollTarget,
} from './core/timelineModel.js';

// Preserve overlapping days/rows (including hover and keyboard focus) rather
// than remounting a whole timeline whenever an outer week enters the buffer.
export function patchTimelineContents(container, markup, keyAttribute) {
    const template = container.ownerDocument.createElement('template');
    template.innerHTML = markup;
    const patch = (current, next) => {
        if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
            current.replaceWith(next); return next;
        }
        if (current.nodeType === 3) {
            if (current.data !== next.data) current.data = next.data;
            return current;
        }
        if (current.nodeType !== 1) return current;
        for (const attribute of [...current.attributes]) {
            if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
        }
        for (const attribute of next.attributes) {
            if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
        }
        const children = [...next.childNodes];
        children.forEach((child, index) => {
            if (current.childNodes[index]) patch(current.childNodes[index], child);
            else current.appendChild(child);
        });
        while (current.childNodes.length > children.length) current.lastChild.remove();
        return current;
    };
    const existing = new Map([...container.children].map(node => [node.getAttribute(keyAttribute), node]));
    const desired = [...template.content.children];
    desired.forEach((next, index) => {
        const key = next.getAttribute(keyAttribute);
        const current = key === null ? null : existing.get(key);
        const node = current ? patch(current, next) : next;
        if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null);
    });
    while (container.children.length > desired.length) container.lastElementChild.remove();
}

/** Shared Calendar/Gantt timeline widget: input, measured date anchoring, and
 * buffered edge paging. Consumers supply content, day dimensions and effects. */
export function createTimelineViewport({
    scroll, track, daySelector, dayWidth, inset = () => 0,
    busy = () => false, onEdge = () => {},
    shouldHandleWheel = () => true,
}) {
    let pan = null;
    let paging = false;
    let disposed = false;
    let suppressClick = false;
    let clickTimer = null;
    let restoring = false;
    let restoreGeneration = 0;
    let scrollTarget = null;
    const originalAnchoring = scroll.style.overflowAnchor;
    scroll.style.overflowAnchor = 'none';
    const listeners = [];
    const listen = (type, handler, options) => {
        scroll.addEventListener(type, handler, options);
        listeners.push(() => scroll.removeEventListener(type, handler, options));
    };
    function setScrollLeft(left) {
        scrollTarget = null;
        const position = Math.max(0, Number(left) || 0);
        if (typeof scroll.scrollTo === 'function') scroll.scrollTo({ left: position, top: scroll.scrollTop, behavior: 'instant' });
        else scroll.scrollLeft = position;
    }
    function scrollBy(left) {
        scrollTarget = timelineScrollTarget(scroll.scrollLeft, scrollTarget, left, scroll.scrollWidth - scroll.clientWidth);
        const delta = scrollTarget - scroll.scrollLeft;
        const reduced = scroll.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (typeof scroll.scrollBy === 'function') scroll.scrollBy({ left: delta, behavior: reduced ? 'instant' : 'smooth' });
        else setScrollLeft(scrollTarget);
    }
    const dayLeft = day => day.getBoundingClientRect().left - track.getBoundingClientRect().left;
    function captureMarker() {
        const days = [...track.querySelectorAll(daySelector)];
        const position = scroll.scrollLeft + inset();
        const marker = days.find(day => dayLeft(day) + Math.max(1, day.getBoundingClientRect().width) > position) || days.at(-1);
        return marker ? { date: marker.dataset.date, viewportOffset: dayLeft(marker) - scroll.scrollLeft } : null;
    }
    function restoreMarker(marker) {
        const day = [...track.querySelectorAll(daySelector)].find(element => element.dataset.date === marker?.date);
        if (!day) return false;
        setScrollLeft(dayLeft(day) - marker.viewportOffset); return true;
    }
    function center(date) {
        const day = [...track.querySelectorAll(daySelector)].find(element => element.dataset.date === date);
        if (day) setScrollLeft(dayLeft(day) - inset() - (scroll.clientWidth - inset() - day.getBoundingClientRect().width) / 2);
    }
    const frame = () => new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolve);
        else setTimeout(resolve, 0);
    });
    function updateContent(render, { mode = 'marker', date = '' } = {}) {
        if (disposed) return;
        // Capture at commit time, not before an asynchronous data read: the
        // user may have kept scrolling while the next range was loading.
        const marker = mode === 'marker' ? captureMarker() : null;
        const previousLeft = scroll.scrollLeft;
        const pendingTarget = scrollTarget;
        const generation = ++restoreGeneration;
        restoring = true;
        try {
            render();
            if (mode === 'center') center(date);
            else if (!restoreMarker(marker)) setScrollLeft(previousLeft);
            if (pan && mode !== 'center') pan.startScrollLeft += scroll.scrollLeft - previousLeft;
            // Rebasing interrupts a native smooth scroll. Resume its remaining
            // distance in the new coordinates rather than dropping wheel input.
            if (mode !== 'center' && pendingTarget !== null) scrollBy(pendingTarget - previousLeft);
        } catch (error) { restoring = false; throw error; }
        // DOM replacement and coordinate rebasing happen in this same turn,
        // before any paint. Only edge-event suppression waits.
        return frame().then(frame).then(() => {
            if (generation === restoreGeneration) restoring = false;
        });
    }
    async function checkEdges() {
        const direction = calendarTimelineEdgeDirection({
            scrollLeft: scroll.scrollLeft, scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth,
            busy: disposed || paging || restoring || pan !== null || busy(), threshold: dayWidth() * CALENDAR_TIMELINE_PREFETCH_DAYS,
        });
        if (!direction) return;
        paging = true;
        try {
            await onEdge(direction);
            // Programmatic marker restoration must not trigger another page.
            await frame(); await frame();
        } finally { paging = false; }
    }
    function finishPan(event, cancel = false) {
        if (!pan || (event?.pointerId != null && event.pointerId !== pan.pointerId)) return;
        const previous = pan; pan = null;
        scroll.classList.remove('is-panning');
        if (cancel) setScrollLeft(previous.startScrollLeft);
        if (scroll.hasPointerCapture?.(previous.pointerId)) scroll.releasePointerCapture(previous.pointerId);
        if (previous.moved && !cancel) {
            suppressClick = true; clearTimeout(clickTimer);
            clickTimer = setTimeout(() => { suppressClick = false; }, 0);
            event?.preventDefault();
        }
        if (!cancel) checkEdges();
    }
    listen('wheel', event => {
        if (!shouldHandleWheel(event) || busy()) return;
        const plan = calendarTimelineWheelPlan({
            deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode,
            clientWidth: scroll.clientWidth, dayWidth: dayWidth(), modified: event.ctrlKey || event.metaKey || event.altKey,
        });
        if (!plan.handled) return;
        event.preventDefault();
        scrollBy(plan.left);
    }, { passive: false });
    listen('pointerdown', event => {
        if (event.button !== 0 || event.isPrimary === false || busy()
            || event.target.closest?.('button, a, input, textarea, select, [role="combobox"]')) return;
        pan = { pointerId: event.pointerId, startClientX: event.clientX, startScrollLeft: scroll.scrollLeft, moved: false };
        setScrollLeft(scroll.scrollLeft);
        scroll.classList.add('is-panning'); scroll.focus({ preventScroll: true });
        scroll.setPointerCapture?.(event.pointerId); event.preventDefault();
    });
    listen('pointermove', event => {
        if (!pan || event.pointerId !== pan.pointerId) return;
        const plan = calendarTimelinePanPlan({ ...pan, clientX: event.clientX, scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth });
        pan.moved ||= plan.moved;
        if (pan.moved) { event.preventDefault(); setScrollLeft(plan.scrollLeft); }
    });
    listen('pointerup', event => finishPan(event));
    listen('pointercancel', event => finishPan(event, true));
    listen('lostpointercapture', event => finishPan(event, true));
    listen('click', event => {
        if (!suppressClick) return;
        suppressClick = false; event.preventDefault(); event.stopPropagation();
    }, true);
    listen('keydown', event => {
        if (event.key === 'Escape' && pan) { event.preventDefault(); finishPan(null, true); return; }
        if (event.target !== scroll) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            scrollBy((event.key === 'ArrowLeft' ? -1 : 1) * dayWidth());
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault(); scrollBy((event.key === 'Home' ? 0 : scroll.scrollWidth) - (scrollTarget ?? scroll.scrollLeft));
        }
    });
    listen('scroll', () => {
        if (scrollTarget !== null && Math.abs(scroll.scrollLeft - scrollTarget) < 1) scrollTarget = null;
        checkEdges();
    });
    return {
        setScrollLeft, captureMarker, restoreMarker, center, updateContent,
        cancelPan: () => finishPan(null, true),
        dispose() { disposed = true; finishPan(null, true); setScrollLeft(scroll.scrollLeft); clearTimeout(clickTimer); scroll.style.overflowAnchor = originalAnchoring; listeners.forEach(remove => remove()); },
    };
}
