import {
    planVimClipboardPaste,
    vimPasteReplayKeys,
} from '../frontend/js/core/vimClipboardModel.js';

describe('Vim clipboard policy', () => {
    test('prefers system text while retaining Vim register shape when both clipboards agree', () => {
        expect(planVimClipboardPaste({
            systemText: 'alpha\n',
            internalText: 'alpha\n',
            internalLinewise: true,
            internalBlockwise: false,
        })).toEqual({
            text: 'alpha\n',
            linewise: true,
            blockwise: false,
            updateRegister: false,
            source: 'system',
        });
    });

    test('imports a different OS clipboard as characterwise text and falls back internally', () => {
        expect(planVimClipboardPaste({
            systemText: 'from the OS',
            internalText: 'from Vim',
            internalLinewise: true,
            internalBlockwise: true,
        })).toEqual({
            text: 'from the OS',
            linewise: false,
            blockwise: false,
            updateRegister: true,
            source: 'system',
        });
        expect(planVimClipboardPaste({
            systemText: '',
            internalText: 'from Vim',
            internalLinewise: false,
            internalBlockwise: false,
        })).toEqual({
            text: 'from Vim',
            linewise: false,
            blockwise: false,
            updateRegister: false,
            source: 'internal',
        });
    });

    test('replays Vim paste placement and counts without inventing editor changes', () => {
        expect(vimPasteReplayKeys({ after: true, repeat: 1 })).toEqual(['<FigaroPasteAfter>']);
        expect(vimPasteReplayKeys({ after: false, repeat: 12 })).toEqual(['1', '2', '<FigaroPasteBefore>']);
        expect(vimPasteReplayKeys({ after: true, repeat: 2, registerName: 'a' }))
            .toEqual(['"', 'a', '2', '<FigaroPasteAfter>']);
    });
});
