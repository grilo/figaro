const markdownLinkTarget = /^(https?:\/\/|mailto:|xmpp:|www\.)/;

/** Build the exact Markdown replacement for a URL pasted over plain prose. */
export function markdownLinkPastePlan({
    clipboardText = '',
    selectedText = '',
    markdownActive = false,
    plainSelection = false,
} = {}) {
    const selection = String(selectedText || '');
    let target = typeof clipboardText === 'string' ? clipboardText : '';
    if (!selection || !markdownActive || !plainSelection || !markdownLinkTarget.test(target)) return null;
    if (target.startsWith('www.')) target = `https://${target}`;
    return {
        target,
        insertion: `[${selection}](${target})`,
    };
}

export default { markdownLinkPastePlan };
