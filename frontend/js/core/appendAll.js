/**
 * Append every item of `items` to `target` and return `target`.
 *
 * `target.push(...items)` passes each item as a call argument and throws a
 * RangeError once `items` exceeds the engine's argument limit: about 125,000
 * in V8 and 65,536 in JavaScriptCore. A single long paragraph or a large note
 * reaches that, so collections sized by the source are appended one by one.
 */
export function appendAll(target, items) {
    for (const item of items) target.push(item);
    return target;
}
