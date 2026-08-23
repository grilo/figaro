import {
    calendarDayClassName,
    calendarDayLabelParts,
    calendarDayState,
    calendarMonthGrid,
    calendarMonthPresentation,
    calendarMonthSummaryMap,
    calendarNoteAssociations,
    calendarSessionSelectionPlan,
    localeWeekInfo,
    localeWeekdays,
    noteIntensityLevel,
    overlayCalendarLinkedNotes,
    overlayCalendarMonthNotes,
    tooltipPosition,
} from '../../../frontend/js/core/calendarModel.js';

describe('calendar model', () => {
    test('plans Today only for a fresh Calendar session and preserves a valid session selection', () => {
        expect(calendarSessionSelectionPlan(null, '2026-08-23')).toEqual({
            selectedDateStr: '2026-08-23',
            initializeFromToday: true,
        });
        expect(calendarSessionSelectionPlan('2026-08-21', '2026-08-23')).toEqual({
            selectedDateStr: '2026-08-21',
            initializeFromToday: false,
        });
        expect(calendarSessionSelectionPlan('not-a-date', 'not-a-date')).toEqual({
            selectedDateStr: null,
            initializeFromToday: false,
        });
    });

    test('reads method and legacy-property week information with a safe world fallback', () => {
        class MethodLocale {
            getWeekInfo() {
                return { firstDay: 7, weekend: [5, 6] };
            }
        }
        class PropertyLocale {
            constructor() {
                this.weekInfo = { firstDay: 1, weekend: [6, 7] };
            }
        }
        class BrokenLocale {
            constructor() {
                throw new RangeError('unsupported locale');
            }
        }

        expect(localeWeekInfo('ar-SA', MethodLocale)).toEqual({ firstDay: 7, weekend: [5, 6] });
        expect(localeWeekInfo('es-ES', PropertyLocale)).toEqual({ firstDay: 1, weekend: [6, 7] });
        expect(localeWeekInfo('invalid', BrokenLocale)).toEqual({ firstDay: 1, weekend: [6, 7] });
    });

    test('rotates localized weekday labels and month cells from the locale first day', () => {
        const weekdays = localeWeekdays('es-ES', 1);
        expect(weekdays[0].long.toLocaleLowerCase('es-ES')).toBe('lunes');
        expect(weekdays[6].long.toLocaleLowerCase('es-ES')).toBe('domingo');

        const mondayFirst = calendarMonthGrid(2026, 4, 1);
        const sundayFirst = calendarMonthGrid(2026, 4, 7);
        expect(mondayFirst[0]).toEqual([0, 0, 0, 0, 1, 2, 3]);
        expect(sundayFirst[0]).toEqual([0, 0, 0, 0, 0, 1, 2]);
    });

    test('maps distinct note counts to five Git-style intensity levels', () => {
        expect([0, 1, 2, 3, 4, 6, 7, 9, 10, 40].map(noteIntensityLevel))
            .toEqual([0, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    });

    test('keeps note density, weekends, and due state as independent layers', () => {
        expect(calendarDayState({
            isoDay: 5,
            weekend: [5, 6],
            noteCount: 10,
            dueTitles: ['Ship release', 'Review migration'],
        })).toEqual({
            isWeekend: true,
            noteLevel: 5,
            hasDue: true,
            clickable: true,
        });
        expect(calendarDayState({
            isoDay: 2,
            weekend: [6, 7],
            noteCount: 0,
            dueTitles: [],
        }).clickable).toBe(false);
        expect(calendarDayState({
            isoDay: 2,
            weekend: [6, 7],
            noteCount: 0,
            dueTitles: [],
            isToday: true,
        }).clickable).toBe(true);
    });

    test('builds one shared day presentation for sidebar and popup calendars', () => {
        const presentation = calendarMonthPresentation({
            year: 2026,
            month: 7,
            data: {
                day_summaries: [
                    { day: 4, note_count: 6, due_titles: [] },
                    { day: 8, note_count: 1, due_titles: ['Ship release'] },
                ],
            },
            selectedDateStr: '2026-08-04',
            todayStr: '2026-08-04',
            firstDay: 1,
            weekend: [6, 7],
        });
        const days = presentation.weeks.flat().filter(day => !day.empty);
        const today = days.find(day => day.dateStr === '2026-08-04');
        const weekendDue = days.find(day => day.dateStr === '2026-08-08');

        expect(calendarDayClassName(today)).toBe(
            'ui-date-picker-day cal-day selected has-note ui-date-picker-day--note-3',
        );
        expect(calendarDayClassName(weekendDue)).toBe(
            'ui-date-picker-day cal-day is-weekend ui-date-picker-day--weekend has-note ui-date-picker-day--note-1 has-due-task ui-date-picker-day--due',
        );
        expect(calendarDayLabelParts(weekendDue, 'Saturday, August 8, 2026')).toEqual([
            'Saturday, August 8, 2026',
            'Weekend',
            '1 note',
            '1 due item: Ship release',
        ]);
    });

    test('prefers structured note counts so due links do not inflate note intensity', () => {
        const summaries = calendarMonthSummaryMap({
            days_with_links: [15],
            days_with_due_tasks: [15],
            day_summaries: [{ day: 15, note_count: 0, due_titles: ['Ship release'] }],
        });
        expect(summaries.get(15)).toEqual({
            noteCount: 0,
            dueTitles: ['Ship release'],
            hasDue: true,
        });
    });

    test('projects daily notes and ordinary links once while excluding semantic due links', () => {
        expect(calendarNoteAssociations('Inbox/2026-08-21.md', [
            '# Daily note',
            '[First](2026-08-22.md) and [again](2026-08-22.md)',
            '- [ ] Ship #todo [due 2026-08-23](2026-08-23.md)',
            '[Context](2026-08-23.md)',
            '[Invalid](2026-02-31.md)',
        ].join('\n'))).toEqual([
            expect.objectContaining({ date: '2026-08-21', path: 'Inbox/2026-08-21.md', line_num: 1 }),
            expect.objectContaining({ date: '2026-08-22', path: 'Inbox/2026-08-21.md', line_num: 2 }),
            expect.objectContaining({ date: '2026-08-23', path: 'Inbox/2026-08-21.md', line_num: 4 }),
        ]);
        expect(calendarNoteAssociations('tasks.md', '- [ ] Ship #todo [due 2026-08-23](2026-08-23.md)')).toEqual([]);
    });

    test('replaces saved file contributions with dirty-buffer dates in the month and selected-day rows', () => {
        const baseline = new Map([['notes/plan.md', calendarNoteAssociations(
            'notes/plan.md',
            '[Old](2026-08-04.md)',
        )]]);
        const current = new Map([['notes/plan.md', calendarNoteAssociations(
            'notes/plan.md',
            '[Tomorrow](2026-08-22.md)',
        )]]);
        const overlaid = overlayCalendarMonthNotes({
            day_summaries: [
                { day: 4, note_count: 2, due_titles: [] },
                { day: 22, note_count: 0, due_titles: ['Ship release'] },
            ],
        }, 2026, 8, baseline, current);

        expect(overlaid.day_summaries).toEqual([
            { day: 4, note_count: 1, due_titles: [] },
            { day: 22, note_count: 1, due_titles: ['Ship release'] },
        ]);
        expect(overlayCalendarLinkedNotes([
            { path: 'notes/plan.md', name: 'plan.md', line_num: 1 },
            { path: 'notes/other.md', name: 'other.md', line_num: 2 },
        ], '2026-08-22', current)).toEqual([
            { path: 'notes/other.md', name: 'other.md', line_num: 2 },
            expect.objectContaining({ path: 'notes/plan.md', name: 'plan.md', line_num: 1 }),
        ]);
    });

    test('places activity tooltips inside the viewport and flips above near the bottom', () => {
        expect(tooltipPosition(
            { left: 280, top: 180, bottom: 210, width: 30 },
            { width: 120, height: 80 },
            { width: 320, height: 240 },
        )).toEqual({ left: 192, top: 94 });
        expect(tooltipPosition(
            { left: 2, top: 10, bottom: 40, width: 30 },
            { width: 120, height: 60 },
            { width: 320, height: 240 },
        )).toEqual({ left: 8, top: 46 });
    });
});
