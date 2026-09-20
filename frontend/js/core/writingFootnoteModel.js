/** Footnote identifiers are source syntax, including references not yet defined.
 * Inline footnotes (^[prose]) and escaped literal brackets remain ordinary prose.
 */
export function writingFootnoteRanges(source) {
    const ranges = [];
    for (const match of source.matchAll(/\[\^([^\]\r\n]+)\]/g)) {
        let escapes = 0;
        for (let at = match.index - 1; at >= 0 && source[at] === '\\'; at--) escapes++;
        if (escapes % 2 === 0) ranges.push({ from: match.index, to: match.index + match[0].length });
    }
    return ranges;
}
