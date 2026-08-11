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
});
