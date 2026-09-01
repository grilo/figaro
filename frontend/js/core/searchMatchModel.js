/** Build the nonvisual status text for CodeMirror's in-note Find panel. */
export function searchMatchAnnouncement({ query = '', valid = true, total = 0, activeIndex = -1 } = {}) {
    if (!query) return '';
    if (!valid) return 'Invalid search pattern';
    if (total <= 0) return 'No matches';
    if (activeIndex >= 0 && activeIndex < total) {
        return `${activeIndex + 1} of ${total} ${total === 1 ? 'match' : 'matches'}`;
    }
    return `${total} ${total === 1 ? 'match' : 'matches'}`;
}
