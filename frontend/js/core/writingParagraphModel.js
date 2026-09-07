/** Rebase a paragraph without changing its text, children, or relative ranges. */
export function localWritingParagraph(node) {
    const origin = node.range[0], firstLine = node.loc.start.line, firstColumn = node.loc.start.column;
    const location = point => ({ ...point, line: point.line - firstLine + 1, column: point.column - (point.line === firstLine ? firstColumn : 0) });
    const local = value => ({ ...value, range: value.range.map(offset => offset - origin),
        loc: { start: location(value.loc.start), end: location(value.loc.end) },
        ...(value.children ? { children: value.children.map(local) } : {}),
    });
    return local(node);
}
