import { createWritingLensesApplyAll } from '../../../frontend/js/usecases/writingLensesApplyAll.js';
import { createWritingLensesPreferences } from '../../../frontend/js/usecases/writingLensesPreferences.js';
const choices = { language: 'en-US', lenses: ['spelling', 'plain'] };

test('Apply to all documents drains older saves, updates cached notes and retries a failed atomic write', async () => {
    let finish;
    const events = [];
    const controller = createWritingLensesPreferences({ load: async () => choices, save: () => new Promise(resolve => { finish = () => { events.push('document saved'); resolve(); }; }) });
    const ready = controller.restore(); await ready;
    controller.update({ type: 'lens', value: 'direct', enabled: true });
    const save = jest.fn().mockRejectedValueOnce(new Error('read only')).mockImplementation(async () => events.push('all saved'));
    const entries = [{ controller, ready }];
    const all = createWritingLensesApplyAll({ entries: () => entries, save });
    const first = all.apply(choices);
    await Promise.resolve(); expect(save).not.toHaveBeenCalled(); expect(all.snapshot().applying).toBe(true);
    finish(); await first;
    expect(all.snapshot().applyError).toContain('Couldn’t apply');
    expect(controller.snapshot().preferences.lenses).toContain('direct');
    await all.retry();
    expect(events).toEqual(['document saved', 'all saved']);
    expect(controller.snapshot().preferences).toEqual(choices);
    expect(all.snapshot()).toEqual({ applying: false, applyError: '' });
});
