/**
 * Pure rules for Figaro's Vim ex commands.
 */

/**
 * The vault path `:e name` addresses: beside the active note, with `.md`
 * appended when the name carries no Markdown extension. Returns '' when the
 * command names nothing.
 */
export function vimEditTargetPath(argument, activeTab = null) {
    const name = String(argument ?? '').trim();
    if (!name) return '';
    let directory = '';
    if (activeTab?.type === 'file' && typeof activeTab.path === 'string') {
        const separator = activeTab.path.lastIndexOf('/');
        if (separator >= 0) directory = activeTab.path.slice(0, separator + 1);
    }
    return directory + (name.endsWith('.md') ? name : `${name}.md`);
}
