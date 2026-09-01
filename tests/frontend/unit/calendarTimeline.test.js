import { createCalendarTimeline } from '../../../frontend/js/calendarTimeline.js';

function timelineDOM() {
    document.body.innerHTML = `
        <section id="timeline" aria-busy="false">
            <span class="calendar-timeline-range"></span>
            <button class="calendar-timeline-today">Today</button>
            <button class="calendar-timeline-earlier">Earlier</button>
            <button class="calendar-timeline-later">Later</button>
            <div class="calendar-timeline-stage">
                <div class="calendar-timeline-scroll" tabindex="0">
                    <div class="calendar-timeline-track"></div>
                </div>
                <p class="calendar-timeline-message" hidden></p>
            </div>
        </section>`;
    return document.getElementById('timeline');
}

async function settleTimeline() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
}

function pointerEvent(type, { clientX, pointerId = 1, button = 0 } = {}) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    Object.defineProperty(event, 'isPrimary', { value: true });
    return event;
}

describe('Calendar Timeline view', () => {
    let session;

    beforeEach(() => {
        window.lucide = {
            icons: {
                Star: [['path', { d: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z' }]],
            },
        };
    });

    afterEach(() => {
        session?.dispose();
        session = null;
        delete window.lucide;
        document.body.replaceChildren();
    });

    test('renders stacked note pills with direct appearance and opens the first date occurrence', async () => {
        const root = timelineDOM();
        const loadTimeline = jest.fn().mockResolvedValue({
            start_date: '2026-08-08',
            end_date: '2026-09-18',
            days: [{
                date: '2026-08-29',
                notes: [
                    { path: 'Notes/Styled.md', name: 'Styled.md', line_num: 6, mtime: 2 },
                    { path: 'Notes/Second.md', name: 'Second.md', line_num: 3, mtime: 1 },
                ],
            }],
        });
        const loadAppearance = jest.fn().mockResolvedValue({
            entries: {
                'Notes/Styled.md': { icon: 'Star', color: '#ef4444' },
            },
        });
        const openNote = jest.fn();
        session = createCalendarTimeline(root, {
            loadTimeline,
            loadAppearance,
            openNote,
            today: () => '2026-08-29',
            locale: () => 'en-US',
        });

        await session.activate('2026-08-29');
        await settleTimeline();

        expect(loadTimeline).toHaveBeenCalledWith('2026-08-08', '2026-09-18');
        expect(root.getAttribute('aria-busy')).toBe('false');
        expect(root.querySelectorAll('.calendar-timeline-day')).toHaveLength(42);
        const today = root.querySelector('[data-date="2026-08-29"]');
        expect(today.dataset.today).toBe('true');
        expect(today.dataset.weekend).toBe('true');
        expect(today.getAttribute('aria-label')).toContain('weekend');
        expect(root.querySelector('[data-date="2026-08-31"]').dataset.weekend).toBeUndefined();
        expect(today.querySelectorAll('.calendar-timeline-note')).toHaveLength(2);
        const styled = today.querySelector('[data-path="Notes/Styled.md"]');
        expect(styled.textContent).toContain('Styled');
        expect(styled.classList.contains('has-custom-color')).toBe(true);
        expect(styled.style.getPropertyValue('--calendar-timeline-note-color')).toBe('#ef4444');
        expect(styled.querySelector('.calendar-timeline-note-icon-svg')).not.toBeNull();
        expect(today.querySelector('[data-path="Notes/Second.md"] .calendar-timeline-note-icon')).toBeNull();

        styled.click();
        expect(openNote).toHaveBeenCalledWith({
            path: 'Notes/Styled.md',
            line: 6,
            date: '2026-08-29',
        });

        root.querySelector('.calendar-timeline-earlier').click();
        await settleTimeline();
        expect(loadTimeline).toHaveBeenLastCalledWith('2026-07-25', '2026-09-04');
    });

    test('loads the previous week when horizontal scrolling enters the left prefetch buffer', async () => {
        const root = timelineDOM();
        const scroll = root.querySelector('.calendar-timeline-scroll');
        const loadTimeline = jest.fn(async (startDate, endDate) => ({
            start_date: startDate,
            end_date: endDate,
            days: [],
        }));
        session = createCalendarTimeline(root, {
            loadTimeline,
            loadAppearance: jest.fn().mockResolvedValue({ entries: {} }),
            openNote: jest.fn(),
            today: () => '2026-08-29',
            locale: () => 'en-US',
        });
        await session.activate('2026-08-29');
        Object.defineProperties(scroll, {
            clientWidth: { configurable: true, value: 900 },
            scrollWidth: { configurable: true, value: 6888 },
        });

        scroll.scrollLeft = 0;
        scroll.dispatchEvent(new Event('scroll'));

        expect(loadTimeline).toHaveBeenLastCalledWith('2026-08-01', '2026-09-11');
        expect(session.getAnchorDate()).toBe('2026-08-22');
        await settleTimeline();
        await new Promise(resolve => setTimeout(resolve, 70));
        expect(root.getAttribute('aria-busy')).toBe('false');
    });

    test('keeps the six-week track visible while an adjacent week preloads', async () => {
        const root = timelineDOM();
        const scroll = root.querySelector('.calendar-timeline-scroll');
        let resolvePrefetch;
        const loadTimeline = jest.fn()
            .mockResolvedValueOnce({ days: [] })
            .mockImplementationOnce(() => new Promise(resolve => { resolvePrefetch = resolve; }));
        session = createCalendarTimeline(root, {
            loadTimeline,
            loadAppearance: jest.fn().mockResolvedValue({ entries: {} }),
            openNote: jest.fn(),
            today: () => '2026-08-29',
            locale: () => 'en-US',
        });
        await session.activate('2026-08-29');
        await settleTimeline();
        Object.defineProperties(scroll, {
            clientWidth: { configurable: true, value: 900 },
            scrollWidth: { configurable: true, value: 6888 },
        });

        scroll.scrollLeft = 0;
        scroll.dispatchEvent(new Event('scroll'));
        await Promise.resolve();

        expect(loadTimeline).toHaveBeenLastCalledWith('2026-08-01', '2026-09-11');
        expect(root.getAttribute('aria-busy')).toBe('true');
        expect(root.querySelector('.calendar-timeline-message').hidden).toBe(true);
        expect(root.querySelectorAll('.calendar-timeline-day')).toHaveLength(42);
        expect(root.querySelector('.calendar-timeline-day').dataset.date).toBe('2026-08-08');

        resolvePrefetch({ days: [] });
        await settleTimeline();
        await new Promise(resolve => setTimeout(resolve, 70));
        expect(root.getAttribute('aria-busy')).toBe('false');
        expect(root.querySelector('.calendar-timeline-day').dataset.date).toBe('2026-08-01');
    });

    test('commits delayed prefetch at the latest scrolled position without remounting overlapping days', async () => {
        const root = timelineDOM();
        const scroll = root.querySelector('.calendar-timeline-scroll');
        const track = root.querySelector('.calendar-timeline-track');
        Object.defineProperties(scroll, { clientWidth: { value: 900 }, scrollWidth: { value: 6888 } });
        scroll.scrollTo = ({ left }) => { scroll.scrollLeft = left; };
        scroll.scrollBy = ({ left }) => { scroll.scrollLeft += left; scroll.dispatchEvent(new Event('scroll')); };
        const geometry = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
            const index = [...track.children].indexOf(this);
            return { left: (index < 0 ? 0 : index * 164) - scroll.scrollLeft, width: index < 0 ? 6888 : 164 };
        });
        let resolveRange;
        const loadTimeline = jest.fn().mockResolvedValueOnce({ days: [] })
            .mockImplementationOnce(() => new Promise(resolve => { resolveRange = resolve; }));
        session = createCalendarTimeline(root, {
            loadTimeline, loadAppearance: async () => ({ entries: {} }), openNote: jest.fn(), today: () => '2026-08-29',
        });
        try {
            await session.activate();
            const retained = track.querySelector('[data-date="2026-08-20"]');
            scroll.scrollLeft = 164 * 14 - 2;
            scroll.dispatchEvent(new Event('scroll'));
            expect(root.getAttribute('aria-busy')).toBe('true');
            scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, cancelable: true }));
            const latestLeft = scroll.scrollLeft;
            expect(latestLeft).toBe(164 * 11 - 2);
            resolveRange({ days: [] });
            await settleTimeline();
            expect(scroll.scrollLeft).toBe(latestLeft + 164 * 7);
            expect(track.querySelector('[data-date="2026-08-20"]')).toBe(retained);
            session.dispose();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            expect(track.children).toHaveLength(0);
            expect(root.querySelector('.calendar-timeline-range').textContent).toBe('');
        } finally { geometry.mockRestore(); }
    });

    test('keeps the current range intact when silent edge prefetch fails', async () => {
        const root = timelineDOM();
        const scroll = root.querySelector('.calendar-timeline-scroll');
        const reportError = jest.fn();
        const loadTimeline = jest.fn()
            .mockResolvedValueOnce({ days: [] })
            .mockRejectedValueOnce(new Error('offline'));
        session = createCalendarTimeline(root, {
            loadTimeline,
            loadAppearance: jest.fn().mockResolvedValue({ entries: {} }),
            openNote: jest.fn(),
            today: () => '2026-08-29',
            locale: () => 'en-US',
            reportError,
        });
        await session.activate('2026-08-29');
        await settleTimeline();
        Object.defineProperties(scroll, {
            clientWidth: { configurable: true, value: 900 },
            scrollWidth: { configurable: true, value: 6888 },
        });
        const rangeLabel = root.querySelector('.calendar-timeline-range').textContent;

        scroll.scrollLeft = 0;
        scroll.dispatchEvent(new Event('scroll'));
        await settleTimeline();

        expect(root.getAttribute('aria-busy')).toBe('false');
        expect(root.querySelector('.calendar-timeline-message').hidden).toBe(true);
        expect(root.querySelector('.calendar-timeline-range').textContent).toBe(rangeLabel);
        expect(root.querySelectorAll('.calendar-timeline-day')).toHaveLength(42);
        expect(root.querySelector('.calendar-timeline-day').dataset.date).toBe('2026-08-08');
        expect(session.getAnchorDate()).toBe('2026-08-29');
        expect(reportError).toHaveBeenCalledWith(expect.any(Error));
    });

    test('maps vertical wheel and keyboard input onto horizontal timeline movement', async () => {
        const root = timelineDOM();
        const scroll = root.querySelector('.calendar-timeline-scroll');
        scroll.scrollBy = jest.fn(({ left }) => { scroll.scrollLeft += left; scroll.dispatchEvent(new Event('scroll')); });
        scroll.scrollTo = jest.fn(({ left }) => { scroll.scrollLeft = left; });
        Object.defineProperties(scroll, { clientWidth: { value: 900 }, scrollWidth: { value: 6888 } });
        session = createCalendarTimeline(root, {
            loadTimeline: jest.fn().mockResolvedValue({ days: [] }),
            loadAppearance: jest.fn().mockResolvedValue({ entries: {} }),
            openNote: jest.fn(),
            today: () => '2026-08-29',
            locale: () => 'en-US',
        });
        await session.activate('2026-08-29');
        await settleTimeline();
        scroll.scrollLeft = 3000;

        const wheel = new WheelEvent('wheel', { deltaY: 80, bubbles: true, cancelable: true });
        scroll.dispatchEvent(wheel);
        expect(wheel.defaultPrevented).toBe(true);
        expect(scroll.scrollBy).toHaveBeenCalledWith({ left: 492, behavior: 'smooth' });

        scroll.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        expect(scroll.scrollBy).toHaveBeenLastCalledWith({ left: 164, behavior: 'smooth' });
        scroll.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
        expect(scroll.scrollLeft).toBe(0);
    });

    test('pans from empty Timeline space while leaving note buttons outside the gesture', async () => {
        const root = timelineDOM();
        const scroll = root.querySelector('.calendar-timeline-scroll');
        session = createCalendarTimeline(root, {
            loadTimeline: jest.fn().mockResolvedValue({ days: [] }),
            loadAppearance: jest.fn().mockResolvedValue({ entries: {} }),
            openNote: jest.fn(),
            today: () => '2026-08-29',
            locale: () => 'en-US',
        });
        await session.activate('2026-08-29');
        Object.defineProperties(scroll, {
            clientWidth: { configurable: true, value: 900 },
            scrollWidth: { configurable: true, value: 4592 },
        });
        scroll.scrollLeft = 500;
        const emptyDay = root.querySelector('.calendar-timeline-day');

        emptyDay.dispatchEvent(pointerEvent('pointerdown', { clientX: 600 }));
        expect(scroll.classList.contains('is-panning')).toBe(true);
        const move = pointerEvent('pointermove', { clientX: 400 });
        scroll.dispatchEvent(move);
        expect(move.defaultPrevented).toBe(true);
        expect(scroll.scrollLeft).toBe(700);
        scroll.dispatchEvent(pointerEvent('pointerup', { clientX: 400 }));
        expect(scroll.classList.contains('is-panning')).toBe(false);
    });

    test('styles and announces a failed range without leaving the surface busy', async () => {
        const root = timelineDOM();
        const reportError = jest.fn();
        session = createCalendarTimeline(root, {
            loadTimeline: jest.fn().mockRejectedValue(new Error('offline')),
            loadAppearance: jest.fn().mockResolvedValue({ entries: {} }),
            openNote: jest.fn(),
            today: () => '2026-08-29',
            reportError,
        });

        await session.activate('2026-08-29');
        await settleTimeline();

        const message = root.querySelector('.calendar-timeline-message');
        expect(root.getAttribute('aria-busy')).toBe('false');
        expect(message.hidden).toBe(false);
        expect(message.dataset.state).toBe('error');
        expect(message.textContent).toBe('Timeline is unavailable right now.');
        expect(reportError).toHaveBeenCalledWith(expect.any(Error));
    });

    test('disposes rendered days, labels, and loading state with the Timeline session', async () => {
        const root = timelineDOM();
        session = createCalendarTimeline(root, {
            loadTimeline: jest.fn().mockResolvedValue({ days: [] }),
            loadAppearance: jest.fn().mockResolvedValue({ entries: {} }),
            openNote: jest.fn(),
            today: () => '2026-08-29',
        });
        await session.activate('2026-08-29');
        await settleTimeline();

        session.dispose();

        expect(root.querySelectorAll('.calendar-timeline-day')).toHaveLength(0);
        expect(root.querySelector('.calendar-timeline-range').textContent).toBe('');
        expect(root.querySelector('.calendar-timeline-message').hidden).toBe(true);
        expect(root.getAttribute('aria-busy')).toBe('false');
        session = null;
    });
});
