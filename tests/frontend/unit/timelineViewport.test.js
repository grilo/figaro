import { createTimelineViewport, patchTimelineContents } from '../frontend/js/timelineViewport.js';
import { calendarTimelineWindow, timelineScrollTarget } from '../frontend/js/core/timelineModel.js';

describe.each([
    ['Calendar', 'calendar-timeline-day', 164, 0],
    ['Gantt', 'kanban-gantt-day', 44, 210],
])('shared %s timeline viewport', (_name, dayClass, width, inset) => {
    let scroll, track, viewport, edge, offset;
    beforeEach(() => {
        document.body.innerHTML = `<div id="scroll" tabindex="0"><div id="track">${[1,2,3].map(day => `<div class="${dayClass}" data-date="2026-09-0${day}"></div>`).join('')}</div></div>`;
        scroll = document.getElementById('scroll'); track = document.getElementById('track'); offset = 0;
        Object.defineProperty(scroll, 'clientWidth', { value: 500 });
        Object.defineProperty(scroll, 'scrollWidth', { value: 10000 });
        scroll.scrollTo = jest.fn(({ left }) => { scroll.scrollLeft = left; });
        scroll.scrollBy = jest.fn(({ left }) => { scroll.scrollLeft += left; });
        track.getBoundingClientRect = () => ({ left: -scroll.scrollLeft });
        [...track.children].forEach((day, i) => { day.getBoundingClientRect = () => ({ left: inset + (i + offset) * width - scroll.scrollLeft, width }); });
        edge = jest.fn();
        viewport = createTimelineViewport({ scroll, track, daySelector: `.${dayClass}`, dayWidth: () => width, inset: () => inset, onEdge: edge });
    });
    afterEach(() => { viewport.dispose(); document.body.replaceChildren(); });
    test('wheel and empty-space pan use the same widget and dispose removes its listeners', () => {
        const wheel = new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true });
        scroll.dispatchEvent(wheel);
        expect(wheel.defaultPrevented).toBe(true);
        expect(scroll.scrollBy).toHaveBeenCalledWith({ left: width * 3, behavior: 'smooth' });
        scroll.scrollLeft = 100;
        scroll.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, bubbles: true }));
        scroll.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, bubbles: true }));
        expect(scroll.scrollLeft).toBe(140);
        scroll.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(scroll.scrollLeft).toBe(100);
        viewport.dispose();
        const untouched = new WheelEvent('wheel', { deltaY: 1, cancelable: true });
        scroll.dispatchEvent(untouched); expect(untouched.defaultPrevented).toBe(false);
    });
    test('preserves the visible date and pixel offset when an outer week is inserted', () => {
        scroll.scrollLeft = width + 10;
        const marker = viewport.captureMarker();
        expect(marker.date).toBe('2026-09-02');
        offset = 7;
        expect(viewport.restoreMarker(marker)).toBe(true);
        expect(scroll.scrollLeft).toBe(width * 8 + 10);
    });
    test('rebases replacement content synchronously before a frame can paint the wrong date', async () => {
        scroll.scrollLeft = width + 10;
        const settled = viewport.updateContent(() => { offset = 7; });
        // This assertion deliberately precedes every promise/frame turn.
        expect(scroll.scrollLeft).toBe(width * 8 + 10);
        expect(scroll.style.overflowAnchor).toBe('none');
        scroll.dispatchEvent(new Event('scroll'));
        expect(edge).not.toHaveBeenCalled();
        await settled;
        viewport.dispose();
        expect(scroll.style.overflowAnchor).toBe('');
        const render = jest.fn(); viewport.updateContent(render);
        expect(render).not.toHaveBeenCalled();
    });
    test('continues unfinished smooth-wheel travel across rebasing and honors reduced motion', async () => {
        scroll.scrollBy.mockImplementation(() => {}); // Browser animation is still in flight.
        scroll.scrollLeft = width + 10;
        scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, cancelable: true }));
        scroll.scrollLeft += width;
        await viewport.updateContent(() => { offset = 7; });
        expect(scroll.scrollLeft).toBe(width * 9 + 10);
        expect(scroll.scrollBy).toHaveBeenLastCalledWith({ left: width * 2, behavior: 'smooth' });
        viewport.setScrollLeft(0);
        const media = jest.spyOn(window, 'matchMedia').mockReturnValue({ matches: true });
        try {
            scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, cancelable: true }));
            expect(scroll.scrollBy).toHaveBeenLastCalledWith({ left: width * 3, behavior: 'instant' });
        } finally { media.mockRestore(); }
    });
    test('rebases an ongoing pointer pan and its Escape origin when prefetch finishes', async () => {
        scroll.scrollLeft = width + 20;
        scroll.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, bubbles: true }));
        scroll.dispatchEvent(new MouseEvent('pointermove', { clientX: 70, bubbles: true }));
        await viewport.updateContent(() => { offset = 7; });
        expect(scroll.scrollLeft).toBe(width * 8 + 50);
        scroll.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, bubbles: true }));
        expect(scroll.scrollLeft).toBe(width * 8 + 70);
        scroll.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(scroll.scrollLeft).toBe(width * 8 + 20);
    });
    test('retains overlapping days and their focused content rather than remounting them on paging', () => {
        const markup = (day, label = 'Task') => `<div class="${dayClass}" data-date="2026-09-0${day}"><button data-content="${day}">${label}</button></div>`;
        patchTimelineContents(track, markup(1) + markup(2), 'data-date');
        const day = track.children[0];
        const button = day.querySelector('button'); button.focus();
        patchTimelineContents(track, markup(3) + markup(1, 'Updated'), 'data-date');
        expect(track.children).toHaveLength(2);
        expect(track.children[1]).toBe(day);
        expect(day.querySelector('button')).toBe(button);
        expect(document.activeElement).toBe(button);
        expect(button.textContent).toBe('Updated');
        patchTimelineContents(track, '<section data-date="2026-09-01">Changed element</section>', 'data-date');
        expect(track.children).toHaveLength(1);
        expect(track.firstElementChild.tagName).toBe('SECTION');
    });
    test('requests buffered edge paging without exposing consumer data to the widget', () => {
        scroll.scrollLeft = 0; scroll.dispatchEvent(new Event('scroll'));
        expect(edge).toHaveBeenCalledWith(-1);
        scroll.dispatchEvent(new Event('scroll'));
        expect(edge).toHaveBeenCalledTimes(1);
    });
});

test('shared date-window policy retains Calendar defaults and supports denser Gantt days', () => {
    expect(calendarTimelineWindow('2026-08-31').dates).toHaveLength(42);
    const range = calendarTimelineWindow('2026-08-31', { dayCount: 55, daysBefore: 27 });
    expect(range.dates).toHaveLength(55);
    expect(range.dates[27]).toBe('2026-08-31');
});

test('timeline inputs accumulate at the pending destination and clamp to the available track', () => {
    expect(timelineScrollTarget(100, null, 60, 500)).toBe(160);
    expect(timelineScrollTarget(110, 160, 60, 500)).toBe(220);
    expect(timelineScrollTarget(110, 160, -60, 500)).toBe(100);
    expect(timelineScrollTarget(100, null, -200, 500)).toBe(0);
    expect(timelineScrollTarget(100, null, 600, 500)).toBe(500);
});
