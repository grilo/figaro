import {
    taskCheckboxLabel,
    taskCheckboxReplacement,
} from '../frontend/js/core/taskCheckboxModel.js';

describe('rendered task checkbox policy', () => {
    test('maps the rendered state to the Markdown source character', () => {
        expect(taskCheckboxReplacement(false)).toBe('x');
        expect(taskCheckboxReplacement(true)).toBe(' ');
    });

    test('gives the control an action-oriented accessible name derived from the task', () => {
        expect(taskCheckboxLabel('- [ ] Review **release** notes', false))
            .toBe('Mark “Review release notes” complete');
        expect(taskCheckboxLabel('- [x] [Publish](release.md)', true))
            .toBe('Mark “Publish” incomplete');
        expect(taskCheckboxLabel('- [ ]', false)).toBe('Mark task complete');
    });
});
