/** Return the logical-line distance from the editor's primary cursor line. */
export function relativeLineNumberLabel(lineNumber, cursorLineNumber) {
    const distance = Math.abs(lineNumber - cursorLineNumber);
    return distance === 0 ? '' : String(distance);
}

/** Reserve a stable gutter width for the largest possible relative distance. */
export function relativeLineNumberSpacerLabel(lineCount) {
    const largestDistance = Math.max(1, lineCount - 1);
    return '9'.repeat(String(largestDistance).length);
}
