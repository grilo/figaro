/** Keep short jobs bounded while allowing legitimate whole-note work to finish.
 * Source length is available without scanning text or materializing editor state.
 */
export function writingWorkBudget(input) {
    const source = typeof input === 'string' ? input : input?.source ?? input?.job?.source;
    const size = value => typeof value === 'string' ? value.length : 0;
    const length = Math.max(size(source), size(input?.before), size(input?.after));
    return Math.min(30000, Math.max(5000, Math.ceil(length / 65536) * 2000));
}
