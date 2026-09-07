/** Bounded editorial context: no document state, dictionaries or I/O. */
function contextAt(raw, { text }) {
    return {
        before: text.slice(Math.max(0, raw.from - 160), raw.from).split(/\n[ \t]*\n/u).at(-1),
        after: text.slice(raw.to, raw.to + 160).split(/\n[ \t]*\n/u)[0],
    };
}

export function writingWordinessContext(raw, projection) {
    const word = raw.actual?.toLowerCase();
    if (!['function', 'request', 'parameters', 'type', 'address', 'it is'].includes(word)) return false;
    const { before, after } = contextAt(raw, projection), context = before + ' ' + after;
    const programming = /\b(?:code|program(?:ming|s)?|javascript|python|call(?:s|ed|ing)?|return(?:s|ed)?|arguments?|parameters?|variables?|scopes?|objects?|methods?|literals?|values?|notebooks?|cells?|statements?|exceptions?|integers?|class(?:es)?|keywords?|positional|data|headers?|content|payload|callbacks?)\b|\uFFFC/iu.test(context);
    if (word === 'function' || word === 'parameters') return programming;
    if (word === 'request') return /\b(?:HTTP|header|body|response|status|URL|client|server|browser|resource|payload|method|GET|POST)\b/iu.test(context)
        || /\b(?:the|a|an|this|that|each|every|your|our|their)\s+$/iu.test(before);
    if (word === 'type') return programming;
    if (word === 'address') return /\b(?:postal|email|mailing|street|home|billing|shipping|IP|network|name(?:,| and)?|your|my|their|the|an)\s+$/iu.test(before)
        || /^\s+(?:is|was|will|can|should|has|must)\b/iu.test(after);
    // Referential “it” is not an empty introduction. Keep the explicit
    // evaluative forms (“it is important to”) available for contextual review.
    return /\b(?:if|when|while|although|because|unless|whether)\s+$/iu.test(before)
        || /^\s+(?:a|an|the|called|defined|used|described|written|stored|returned|assigned|printed)\b/iu.test(after);
}

export function writingInclusiveContext(raw, projection) {
    const word = raw.actual.toLowerCase(), { before, after } = contextAt(raw, projection);
    if (word === 'easy' && /^[ -]+read\b/iu.test(after)) return { skip: true };
    if (['easy', 'easily', 'simple', 'simply', 'obvious', 'obviously', 'straightforward'].includes(word)
        && /\b(?:not|never|hardly|cannot|can['’]t|isn['’]t|aren['’]t|wasn['’]t|weren['’]t)(?:\s+(?:be|so|very|always|necessarily|particularly|that)){0,3}\s+$/iu.test(before)) return { skip: true };
    if (word === 'just' && /\bnot\s+$/iu.test(before)) return { skip: true };
    if (word === 'just' && /^\s+(?:as|like)\b/iu.test(after)) return { skip: true };
    if (word === 'simply' && /\bbeyond\s+$/iu.test(before)) return { skip: true };
    if (word === 'clearly' && /^\s+(?:annotated|labelled|labeled|documented|marked|defined|visible|stated|explained)\b/iu.test(after)) return { skip: true };
    if (raw.actual === 'Simple' && /\bTen\s+$/u.test(before) && /^\s+Rules\b/u.test(after)) return { skip: true };
    const tone = ['easy', 'easily', 'simple', 'simply', 'just', 'obvious', 'obviously', 'clearly', 'basically', 'straightforward', 'straight-forward', 'of course', 'everyone knows'];
    return tone.includes(word) ? { note: 'This wording can assume that readers find a task easy or already know the answer. Describe the steps or prerequisites when useful; keep factual descriptions of difficulty or clarity.', adviceType: 'reader-assumption' } : {};
}
