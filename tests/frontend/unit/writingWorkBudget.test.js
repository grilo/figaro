import { writingWorkBudget } from '../../../frontend/js/core/writingWorkBudget.js';
test('writing job budgets use only source length, retain short-job limits and cap whole-note work', () => {
    expect(writingWorkBudget('short')).toBe(5000);
    expect(writingWorkBudget({ source: 'x'.repeat(300000) })).toBe(10000);
    expect(writingWorkBudget('x'.repeat(2097152))).toBe(30000);
    expect(writingWorkBudget({ job: { source: 'x'.repeat(300000) } })).toBe(10000);
    expect(writingWorkBudget({ before: 'x'.repeat(300000), after: 'short' })).toBe(10000);
    expect(writingWorkBudget({})).toBe(5000);
});
