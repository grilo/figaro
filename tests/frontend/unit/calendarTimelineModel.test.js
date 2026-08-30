import {
    CALENDAR_TIMELINE_DAY_COUNT,
    CALENDAR_TIMELINE_PREFETCH_DAYS,
    calendarTimelineEdgeDirection,
    calendarTimelinePanPlan,
    calendarTimelinePresentation,
    calendarTimelineWheelPlan,
    calendarTimelineWindow,
    shiftCalendarTimelineAnchor,
    shiftCalendarTimelineEdgeAnchor,
} from '../../../frontend/js/core/calendarTimelineModel.js';

describe('Calendar Timeline model', () => {
    test('builds a centered six-week buffer and pages by two weeks', () => {
        const window = calendarTimelineWindow('2026-08-29');

        expect(window).toEqual(expect.objectContaining({
            anchorDate: '2026-08-29',
            startDate: '2026-08-08',
            endDate: '2026-09-18',
        }));
        expect(window.dates).toHaveLength(CALENDAR_TIMELINE_DAY_COUNT);
        expect(shiftCalendarTimelineAnchor(window.anchorDate, -1)).toBe('2026-08-15');
        expect(shiftCalendarTimelineAnchor(window.anchorDate, 1)).toBe('2026-09-12');
        expect(calendarTimelineWindow('not-a-date')).toBeNull();
    });

    test('prefetches one week inside a two-week scroll buffer and ignores busy or non-overflowing tracks', () => {
        expect(CALENDAR_TIMELINE_PREFETCH_DAYS).toBe(14);
        expect(calendarTimelineEdgeDirection({
            scrollLeft: 2200,
            scrollWidth: 6888,
            clientWidth: 1100,
            threshold: 2296,
        })).toBe(-1);
        expect(calendarTimelineEdgeDirection({
            scrollLeft: 3550,
            scrollWidth: 6888,
            clientWidth: 1100,
            threshold: 2296,
        })).toBe(1);
        expect(calendarTimelineEdgeDirection({
            scrollLeft: 2900,
            scrollWidth: 6888,
            clientWidth: 1100,
            threshold: 2296,
        })).toBe(0);
        expect(calendarTimelineEdgeDirection({
            scrollLeft: 0,
            scrollWidth: 1000,
            clientWidth: 1000,
        })).toBe(0);
        expect(calendarTimelineEdgeDirection({
            scrollLeft: 0,
            scrollWidth: 6888,
            clientWidth: 1100,
            busy: true,
            threshold: 2296,
        })).toBe(0);
        expect(shiftCalendarTimelineEdgeAnchor('2026-08-29', -1)).toBe('2026-08-22');
        expect(shiftCalendarTimelineEdgeAnchor('2026-08-29', 1)).toBe('2026-09-05');
    });

    test('normalizes wheel input to three days and bounds pointer-driven panning', () => {
        expect(calendarTimelineWheelPlan({
            deltaX: 0,
            deltaY: 9,
            dayWidth: 164,
        })).toEqual({ handled: true, left: 492 });
        expect(calendarTimelineWheelPlan({
            deltaX: -24,
            deltaY: 4,
            dayWidth: 146,
        })).toEqual({ handled: true, left: -438 });
        expect(calendarTimelineWheelPlan({
            deltaX: 0,
            deltaY: 600,
            dayWidth: 164,
        })).toEqual({ handled: true, left: 600 });
        expect(calendarTimelineWheelPlan({
            deltaY: 30,
            dayWidth: 164,
            modified: true,
        })).toEqual({ handled: false, left: 0 });

        expect(calendarTimelinePanPlan({
            startClientX: 500,
            clientX: 300,
            startScrollLeft: 600,
            scrollWidth: 4600,
            clientWidth: 1100,
        })).toEqual({ moved: true, scrollLeft: 800 });
        expect(calendarTimelinePanPlan({
            startClientX: 500,
            clientX: 498,
            startScrollLeft: 600,
            scrollWidth: 4600,
            clientWidth: 1100,
        })).toEqual({ moved: false, scrollLeft: 602 });
        expect(calendarTimelinePanPlan({
            startClientX: 100,
            clientX: 800,
            startScrollLeft: 200,
            scrollWidth: 4600,
            clientWidth: 1100,
        }).scrollLeft).toBe(0);
    });

    test('materializes empty days, overlays dirty notes, and uses only direct note appearance', () => {
        const window = calendarTimelineWindow('2026-08-29');
        const currentByPath = new Map([
            ['Notes/Dirty.md', [
                { date: '2026-08-29', path: 'Notes/Dirty.md', name: 'Dirty.md', line_num: 7, mtime: 0 },
            ]],
            ['Notes/Replaced.md', [
                { date: '2026-08-30', path: 'Notes/Replaced.md', name: 'Replaced.md', line_num: 4, mtime: 0 },
            ]],
        ]);
        const presentation = calendarTimelinePresentation({
            payload: {
                days: [{
                    date: '2026-08-29',
                    notes: [
                        { path: 'Notes/Styled.md', name: 'Styled.md', line_num: 3, mtime: 9 },
                        { path: 'Notes/Replaced.md', name: 'Replaced.md', line_num: 1, mtime: 8 },
                    ],
                }],
            },
            range: window,
            appearances: {
                Notes: { color: '#112233', icon: 'Folder' },
                'Notes/Styled.md': { color: '#EF4444', icon: 'Star' },
                'Notes/Dirty.md': { color: 'invalid', icon: 'bad-icon' },
            },
            currentByPath,
            today: '2026-08-29',
            weekend: [5, 6],
        });

        expect(presentation.days).toHaveLength(CALENDAR_TIMELINE_DAY_COUNT);
        const today = presentation.days.find(day => day.date === '2026-08-29');
        expect(today).toEqual(expect.objectContaining({ isToday: true, isPast: false, isWeekend: true }));
        expect(today.notes).toEqual([
            expect.objectContaining({
                path: 'Notes/Styled.md', label: 'Styled', line: 3, color: '#ef4444', icon: 'Star',
            }),
            expect.objectContaining({
                path: 'Notes/Dirty.md', label: 'Dirty', line: 7, color: '', icon: '',
            }),
        ]);
        expect(today.notes.some(note => note.path === 'Notes/Replaced.md')).toBe(false);
        expect(presentation.days.find(day => day.date === '2026-08-30')).toEqual(expect.objectContaining({
            isWeekend: false,
            notes: [expect.objectContaining({ path: 'Notes/Replaced.md', line: 4 })],
        }));
        expect(presentation.days.find(day => day.date === '2026-08-28')).toEqual(expect.objectContaining({
            isWeekend: true,
            notes: [],
        }));
    });
});
