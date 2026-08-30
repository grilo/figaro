import fs from 'node:fs';
import path from 'node:path';
import { testUtils } from './test_setup.js';
import { initStatusBarPresentation, statusBar } from '../frontend/js/statusBar.js';

describe('status bar', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        testUtils.createMockDOM();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('groups editor state on the left and document metrics on the right in reading order', () => {
        const childIds = selector => [...document.querySelector(selector).children]
            .map(child => child.id)
            .filter(Boolean);

        expect(document.querySelector('.status-buffer-left').getAttribute('aria-label'))
            .toBe('History, relationships, and editor state');
        expect(childIds('.status-buffer-left')).toEqual([
            'history-count',
            'git-status-separator',
            'git-status',
            'backlinks-status',
            'file-type',
            'editor-scale-separator',
            'editor-scale-status',
            'file-encoding',
        ]);
        expect(document.querySelector('.status-buffer-right').getAttribute('aria-label'))
            .toBe('Document metrics');
        expect(childIds('.status-buffer-right')).toEqual([
            'cursor-position',
            'word-count',
            'char-count',
            'reading-time',
        ]);
    });

    test('keeps the footer row mounted for Calendar while hiding only buffer telemetry', () => {
        const styles = fs.readFileSync(path.resolve('frontend/styles/status-tools.css'), 'utf8');
        const calendarRule = /#app:has\(#calendar-workspace-panel\.tab-panel\.active\) > \.status-bar \.status-right\s*\{([^}]*)\}/s.exec(styles)?.[1] || '';

        expect(calendarRule).toMatch(/visibility:\s*hidden/);
        expect(calendarRule).toMatch(/pointer-events:\s*none/);
        expect(calendarRule).not.toMatch(/display:\s*none/);
        expect(styles).not.toMatch(/#app:has\(#calendar-workspace-panel\.tab-panel\.active\) > \.status-bar\s*\{[^}]*display:\s*none/s);
    });

    test('announces complete messages and does not let an old clear hide newer activity', () => {
        const status = document.getElementById('status-text');
        const applicationRegion = document.querySelector('.status-left');
        statusBar.set('Saved');
        statusBar.clearAfter(1000, 'Saved');
        statusBar.set('Moving “Archive”…');

        jest.advanceTimersByTime(1000);

        expect(status.textContent).toBe('Moving “Archive”…');
        expect(status.title).toBe('Moving “Archive”…');
        expect(status.getAttribute('role')).toBe('status');
        expect(status.getAttribute('aria-live')).toBe('polite');
        expect(status.getAttribute('aria-atomic')).toBe('true');
        expect(applicationRegion.dataset.applicationActive).toBe('true');
        expect(applicationRegion.title).toBe('Moving “Archive”…');

        statusBar.clearAfter(1000, 'Moving “Archive”…');
        jest.advanceTimersByTime(1000);
        expect(status.textContent).toBe('Ready');
        expect(applicationRegion.dataset.applicationActive).toBe('false');
        expect(applicationRegion.title).toBe('Ready');
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
        expect(document.querySelector('.status-left').dataset.hasAction).toBe('true');
        action.click();
        expect(undo).toHaveBeenCalledTimes(1);

        statusBar.set('Ready');
        expect(action.hidden).toBe(true);
        expect(action.onclick).toBeNull();
        expect(document.querySelector('.status-left').dataset.hasAction).toBe('false');
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

    test('recedes for ordinary focus and uses the native scroller margins as reveal lanes', async () => {
        const editor = document.querySelector('#editor-container');
        const scroller = document.createElement('div');
        scroller.className = 'cm-scroller';
        const content = document.createElement('div');
        content.className = 'cm-content';
        content.tabIndex = 0;
        scroller.append(content);
        editor.append(scroller);
        initStatusBarPresentation();
        statusBar.clear();

        content.focus();
        expect(document.getElementById('status-bar').dataset.writingRest).toBe('true');
        expect(document.getElementById('status-bar').dataset.applicationIdle).toBe('true');

        scroller.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
        expect(document.getElementById('status-bar').dataset.editorSideReveal).toBe('true');
        content.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
        expect(document.getElementById('status-bar').dataset.editorSideReveal).toBe('false');

        statusBar.setWritingSummary('37 words');
        expect(document.querySelector('.status-right').dataset.writingSummary).toBe('37 words');

        statusBar.setWithAction('Deleted “Draft.md” ·', 'Undo', () => {});
        expect(document.getElementById('status-bar').dataset.writingRest).toBe('false');
        expect(document.getElementById('status-bar').dataset.applicationIdle).toBe('false');

        statusBar.clear();
        expect(document.getElementById('status-bar').dataset.writingRest).toBe('true');

        document.getElementById('vault-loading-panel').hidden = false;
        await Promise.resolve();
        expect(document.getElementById('status-bar').dataset.writingRest).toBe('false');
        document.getElementById('vault-loading-panel').hidden = true;
        await Promise.resolve();
        expect(document.getElementById('status-bar').dataset.writingRest).toBe('true');

        content.blur();
        await Promise.resolve();
        expect(document.getElementById('status-bar').dataset.writingRest).toBe('false');
    });
});
