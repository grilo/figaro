/** Technical tokens are opaque; punctuation surrounding them remains prose. */
export function writingURLRanges(text) {
    const ranges = [];
    for (const match of text.matchAll(/\b(?:https?:\/\/|mailto:)[^\s<>"“”‘’]+/giu)) {
        const value = match[0];
        let end = value.length;
        const balances = { ')': 0, ']': 0, '}': 0 };
        const openings = { '(': ')', '[': ']', '{': '}' };
        for (const char of value) {
            if (openings[char]) balances[openings[char]]++;
            else if (Object.hasOwn(balances, char)) balances[char]--;
        }
        // A URL can itself contain balanced parentheses. Strip only surplus
        // trailing closers belonging to the enclosing sentence or Markdown.
        while (end > 0) {
            const char = value[end - 1];
            if (/[.,;:!?']/u.test(char)) end--;
            else if (Object.hasOwn(balances, char) && balances[char] < 0) { balances[char]++; end--; }
            else break;
        }
        ranges.push({ from: match.index, to: match.index + end });
    }
    return ranges;
}

export function writingTechnicalRanges(text) {
    return [...writingURLRanges(text), ...[
        /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,
        /\b[\w.-]*(?:[_/]|\.[A-Za-z0-9]{1,8})[\w./-]*\b/g,
    ].flatMap(pattern => [...text.matchAll(pattern)].map(match => ({ from: match.index, to: match.index + match[0].length })))];
}
