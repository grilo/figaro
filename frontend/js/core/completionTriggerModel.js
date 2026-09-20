/** Streaming line context for the two automatic completion triggers. */
export function advanceCompletionTriggers(text, previous = {}) {
    let { tail = '', bracket = null, heading = false, hashtag = false } = previous;
    for (const character of text) {
        if (character === '\n') {
            tail = ''; bracket = null; heading = false; hashtag = false;
            continue;
        }
        heading = (heading && !/[\s()\\]/u.test(character))
            || (tail === '](' && character === '#' && bracket === true);
        hashtag = (hashtag && /[a-zA-Z0-9_-]/u.test(character))
            || (character === '#' && /\s/u.test(tail.slice(-1)));
        if (character === '[') bracket = tail.slice(-1) !== '!';
        tail = (tail + character).slice(-2);
    }
    return { tail, bracket, heading, hashtag };
}
