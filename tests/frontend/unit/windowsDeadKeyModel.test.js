import {
    planWindowsDeadKeyDOMChange,
    planWindowsDeadKeyTextReconciliation,
} from '../frontend/js/core/windowsDeadKeyModel.js';

describe('Windows dead-key text reconciliation', () => {
    test('inserts a fallback only while the document still matches the keydown snapshot', () => {
        expect(planWindowsDeadKeyTextReconciliation({
            sourceText: 'before  after',
            currentText: 'before  after',
            from: 7,
            to: 8,
            text: '`',
        })).toEqual({
            action: 'insert-fallback',
            changes: { from: 7, to: 8, insert: '`' },
            anchor: 8,
        });
    });

    test('accepts one native insertion without changing the document', () => {
        expect(planWindowsDeadKeyTextReconciliation({
            sourceText: 'code',
            currentText: 'co`de',
            from: 2,
            text: '`',
        })).toEqual({
            action: 'accept-native',
            changes: null,
            anchor: 3,
        });
    });

    test('removes only the second copy after a duplicate native insertion', () => {
        expect(planWindowsDeadKeyTextReconciliation({
            sourceText: 'code',
            currentText: 'co``de',
            from: 2,
            text: '`',
        })).toEqual({
            action: 'remove-duplicate',
            changes: { from: 3, to: 4, insert: '' },
            anchor: 3,
        });
    });

    test('preserves unrelated edits instead of applying a stale fallback', () => {
        expect(planWindowsDeadKeyTextReconciliation({
            sourceText: 'code',
            currentText: 'changed code',
            from: 2,
            text: '`',
        })).toEqual({ action: 'preserve', changes: null, anchor: null });
    });
});

describe('Windows dead-key DOM changes', () => {
    const pending = {
        sourceText: '',
        from: 0,
        to: 0,
        text: '`',
    };

    test('accepts the first native DOM insertion without relying on InputEvent.data', () => {
        expect(planWindowsDeadKeyDOMChange({
            ...pending,
            currentText: '',
            changeFrom: 0,
            changeTo: 0,
            insertedText: '`',
        })).toEqual({ action: 'accept-native' });
    });

    test('accepts a native replacement at the pending selection', () => {
        expect(planWindowsDeadKeyDOMChange({
            sourceText: 'before XX after',
            currentText: 'before XX after',
            from: 7,
            to: 9,
            text: '`',
            changeFrom: 7,
            changeTo: 9,
            insertedText: '`',
        })).toEqual({ action: 'accept-native' });
    });

    test.each([
        { changeFrom: 1, changeTo: 1, insertedText: '`' },
        { changeFrom: 0, changeTo: 1, insertedText: '``' },
    ])('discards a native DOM duplicate after the fallback is present: %o', (change) => {
        expect(planWindowsDeadKeyDOMChange({
            ...pending,
            currentText: '`',
            ...change,
        })).toEqual({ action: 'discard-native-duplicate' });
    });

    test('ignores unrelated DOM input', () => {
        expect(planWindowsDeadKeyDOMChange({
            ...pending,
            currentText: '`',
            changeFrom: 1,
            changeTo: 1,
            insertedText: 'x',
        })).toEqual({ action: 'ignore' });
    });

    test('discards a delayed duplicate in the middle of existing text', () => {
        expect(planWindowsDeadKeyDOMChange({
            sourceText: 'before  after',
            currentText: 'before ` after',
            from: 7,
            to: 7,
            text: '`',
            changeFrom: 8,
            changeTo: 8,
            insertedText: '`',
        })).toEqual({ action: 'discard-native-duplicate' });
    });
});
