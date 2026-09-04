/**
 * Plan number-only replacements for one ordered Markdown list.
 *
 * The adapter supplies direct sibling items from CodeMirror's syntax tree, so
 * nested lists are normalized independently and item bodies remain untouched.
 */
export function orderedListRenumberChanges(items, startNumber = null) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const normalized = items.filter(item => (
        Number.isInteger(item?.number)
        && Number.isInteger(item?.from)
        && Number.isInteger(item?.to)
        && item.from >= 0
        && item.to > item.from
    ));
    if (normalized.length === 0) return [];

    const first = Number.isInteger(startNumber) ? startNumber : normalized[0].number;
    return normalized.flatMap((item, index) => {
        const expected = first + index;
        return item.number === expected
            ? []
            : [{ from: item.from, to: item.to, insert: String(expected) }];
    });
}
