import { pickerKeyboardPlan } from '../frontend/js/core/pickerModel.js';

describe('settings picker keyboard policy', () => {
    test('opens on an arrow and moves through options only after opening', () => {
        expect(pickerKeyboardPlan({ key: 'ArrowDown', open: false, activeIndex: 1, optionCount: 3 }))
            .toMatchObject({ open: true, activeIndex: 1, preventDefault: true });
        expect(pickerKeyboardPlan({ key: 'ArrowDown', open: true, activeIndex: 1, optionCount: 3 }))
            .toMatchObject({ open: true, activeIndex: 2 });
        expect(pickerKeyboardPlan({ key: 'ArrowDown', open: true, activeIndex: 2, optionCount: 3 }))
            .toMatchObject({ open: true, activeIndex: 0 });
    });

    test('chooses with Enter, closes with Escape, and lets Tab advance focus', () => {
        expect(pickerKeyboardPlan({ key: 'Enter', open: true, activeIndex: 2, optionCount: 3 }))
            .toMatchObject({ open: false, chooseIndex: 2, preventDefault: true });
        expect(pickerKeyboardPlan({ key: 'Escape', open: true, activeIndex: 0, optionCount: 3 }))
            .toMatchObject({ open: false, handled: true, preventDefault: true });
        expect(pickerKeyboardPlan({ key: 'Tab', open: true, activeIndex: 0, optionCount: 3 }))
            .toEqual({ open: false, activeIndex: 0, handled: false, preventDefault: false });
    });
});
