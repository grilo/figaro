import { planWindowsDeadKeyTextReconciliation } from '../frontend/js/core/windowsDeadKeyModel.js';

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
