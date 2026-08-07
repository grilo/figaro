export const vimPasteKeys = Object.freeze({
    after: '<FigaroPasteAfter>',
    before: '<FigaroPasteBefore>',
});

/**
 * Choose the text and Vim register shape for an ordinary p/P command. The OS
 * clipboard wins when it contains text; the unnamed Vim register remains a
 * reliable fallback when clipboard access is unavailable or empty.
 */
export function planVimClipboardPaste({
    systemText = '',
    internalText = '',
    internalLinewise = false,
    internalBlockwise = false,
} = {}) {
    const external = typeof systemText === 'string' ? systemText : '';
    const internal = String(internalText || '');
    const useSystem = external.length > 0;
    const text = useSystem ? external : internal;
    const sameRegisterText = useSystem && external === internal;

    return {
        text,
        linewise: useSystem
            ? (sameRegisterText ? Boolean(internalLinewise) : text.endsWith('\n'))
            : Boolean(internalLinewise),
        blockwise: useSystem
            ? (sameRegisterText ? Boolean(internalBlockwise) : false)
            : Boolean(internalBlockwise),
        updateRegister: useSystem && !sameRegisterText,
        source: useSystem ? 'system' : 'internal',
    };
}

/** Return the Vim keys that replay the original p/P placement and count. */
export function vimPasteReplayKeys({ after = true, repeat = 1, registerName = '' } = {}) {
    const count = Math.max(1, Math.floor(Number(repeat) || 1));
    const prefix = count > 1 ? String(count).split('') : [];
    const register = registerName && registerName !== '"' ? ['"', registerName] : [];
    return [...register, ...prefix, after ? vimPasteKeys.after : vimPasteKeys.before];
}
