import { createWritingLensesPreferences } from '../../../frontend/js/usecases/writingLensesPreferences.js';
import { writingLensGroupState } from '../../../frontend/js/core/writingLensesModel.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('merged lens choices survive controller restarts and a failed save without rewriting legacy subsets on load', async () => {
    let stored = { language: 'en-US', lenses: ['spelling', 'plain', 'formulaic'] };
    const save = jest.fn().mockRejectedValueOnce(new Error('disk full')).mockImplementation(async value => { stored = value; });
    const ports = { load: async () => stored, save };
    const controller = createWritingLensesPreferences(ports);
    await controller.restore();
    expect(writingLensGroupState('proofreading', controller.snapshot().preferences).partial).toBe(true);
    expect(save).not.toHaveBeenCalled();
    controller.update({ type: 'lens', value: 'proofreading', enabled: true }); await tick();
    expect(controller.snapshot().status).toBe('save-error');
    expect(stored.lenses).toEqual(['spelling', 'plain', 'formulaic']);
    await controller.retry();
    controller.update({ type: 'lens', value: 'clarity', enabled: true }); await tick();
    const reopened = createWritingLensesPreferences(ports);
    await reopened.restore();
    expect(reopened.snapshot().preferences.lenses).toEqual(['spelling', 'plain', 'repetition', 'consistency', 'grammar', 'readability', 'formulaic']);
    expect(writingLensGroupState('proofreading', reopened.snapshot().preferences).checked).toBe(true);
    expect(writingLensGroupState('clarity', reopened.snapshot().preferences).checked).toBe(true);
});

test('writing preferences serialize rapid changes and persist the latest combined selection', async () => {
    let complete;
    const save = jest.fn().mockImplementationOnce(() => new Promise(resolve => { complete = resolve; })).mockResolvedValue(undefined);
    const controller = createWritingLensesPreferences({ load: async () => ({ lenses: [], language: 'en-US' }), save });
    await controller.restore();
    controller.update({ type: 'lens', value: 'direct', enabled: true });
    controller.update({ type: 'lens', value: 'spelling', enabled: true });
    controller.update({ type: 'lens', value: 'plain', enabled: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().preferences.lenses).toEqual(['spelling', 'plain', 'direct']);
    complete(); await tick();
    expect(save).toHaveBeenLastCalledWith({ language: 'en-US', lenses: ['spelling', 'plain', 'direct'] });
    expect(controller.snapshot().status).toBe('saved');
});

test('failed writing preference saves retain choices and retry without editing them', async () => {
    const save = jest.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    const controller = createWritingLensesPreferences({ load: async () => ({ language: 'en-US' }), save });
    await controller.restore();
    controller.update({ type: 'lens', value: 'plain', enabled: true }); await tick();
    expect(controller.snapshot()).toMatchObject({ status: 'save-error', preferences: { lenses: ['plain'] } });
    await controller.retry();
    expect(save).toHaveBeenLastCalledWith({ language: 'en-US', lenses: ['plain'] });
    expect(controller.snapshot().status).toBe('saved');
});

test('load failures block preference writes until retry succeeds', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('invalid file')).mockResolvedValue({ primary: 'repetition', overlays: [], language: 'en-US' });
    const save = jest.fn();
    const controller = createWritingLensesPreferences({ load, save });
    await controller.restore();
    controller.update({ type: 'lens', value: 'direct', enabled: true });
    expect(save).not.toHaveBeenCalled();
    expect(controller.snapshot().status).toBe('load-error');
    await controller.retry();
    expect(controller.snapshot().preferences.lenses).toEqual(['repetition']);
});

test('language changes save the unchecked choices together and retain them through failure and retry', async () => {
    const save = jest.fn().mockRejectedValueOnce(new Error('read only')).mockResolvedValue(undefined);
    const controller = createWritingLensesPreferences({ load: async () => ({ language: 'en-US', lenses: ['spelling', 'direct'] }), save });
    await controller.restore();
    controller.update({ type: 'language', value: 'es' }); await tick();
    expect(controller.snapshot()).toMatchObject({ status: 'save-error', preferences: { language: 'es', lenses: ['spelling'] } });
    await controller.retry();
    expect(save).toHaveBeenLastCalledWith({ language: 'es', lenses: ['spelling'] });
    controller.update({ type: 'language', value: 'en-US' }); await tick();
    expect(save).toHaveBeenLastCalledWith({ language: 'en-US', lenses: ['spelling'] });
});

test('loading older unsupported choices unchecks them without writing until an explicit change', async () => {
    const save = jest.fn();
    const controller = createWritingLensesPreferences({ load: async () => ({ language: 'es', lenses: ['spelling', 'plain'] }), save });
    await controller.restore();
    expect(controller.snapshot().preferences).toEqual({ language: 'es', lenses: ['spelling'] });
    expect(save).not.toHaveBeenCalled();
});
