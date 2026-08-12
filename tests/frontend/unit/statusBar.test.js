import { testUtils } from './test_setup.js';
import { statusBar } from '../frontend/js/statusBar.js';

describe('status bar', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        testUtils.createMockDOM();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('announces complete messages and does not let an old clear hide newer activity', () => {
        const status = document.getElementById('status-text');
        statusBar.set('Saved');
        statusBar.clearAfter(1000, 'Saved');
        statusBar.set('Moving “Archive”…');

        jest.advanceTimersByTime(1000);

        expect(status.textContent).toBe('Moving “Archive”…');
        expect(status.title).toBe('Moving “Archive”…');
        expect(status.getAttribute('role')).toBe('status');
        expect(status.getAttribute('aria-live')).toBe('polite');
        expect(status.getAttribute('aria-atomic')).toBe('true');

        statusBar.clearAfter(1000, 'Moving “Archive”…');
        jest.advanceTimersByTime(1000);
        expect(status.textContent).toBe('Ready');
    });

    test('shows delayed activity after one second and never flashes for fast work', () => {
        const spinner = document.getElementById('status-activity-spinner');
        const finishFast = statusBar.beginDelayedActivity(1000);

        jest.advanceTimersByTime(999);
        expect(spinner.hidden).toBe(true);
        finishFast();
        jest.advanceTimersByTime(1);
        expect(spinner.hidden).toBe(true);

        const finishSlow = statusBar.beginDelayedActivity(1000);
        jest.advanceTimersByTime(1000);
        expect(spinner.hidden).toBe(false);
        finishSlow();
        expect(spinner.hidden).toBe(true);
    });

    test('renders one native inline action and clears it with the next status', () => {
        const action = document.getElementById('status-action');
        const undo = jest.fn();
        statusBar.setWithAction('Deleted “Draft.md” ·', 'Undo', undo, {
            ariaLabel: 'Undo deletion of Draft.md',
        });

        expect(action.hidden).toBe(false);
        expect(action.textContent).toBe('Undo');
        expect(action.getAttribute('aria-label')).toBe('Undo deletion of Draft.md');
        action.click();
        expect(undo).toHaveBeenCalledTimes(1);

        statusBar.set('Ready');
        expect(action.hidden).toBe(true);
        expect(action.onclick).toBeNull();
    });

    test('keeps the spinner visible until every overlapping slow activity settles', () => {
        const spinner = document.getElementById('status-activity-spinner');
        const finishFirst = statusBar.beginDelayedActivity(1000);

        jest.advanceTimersByTime(1000);
        expect(spinner.hidden).toBe(false);
        const finishSecond = statusBar.beginDelayedActivity(1000);
        finishFirst();
        expect(spinner.hidden).toBe(false);
        jest.advanceTimersByTime(999);
        expect(spinner.hidden).toBe(false);
        finishSecond();
        expect(spinner.hidden).toBe(true);
    });
});
