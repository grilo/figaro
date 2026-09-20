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

// A dot or a slash alone is also ordinary prose punctuation. Only treat a
// token as opaque when it has recognizable file, identifier, or path structure.
const fileExtensions = new Set(('md markdown mdx txt rst org pdf doc docx odt rtf csv tsv xls xlsx ods ppt pptx odp '
    + 'js mjs cjs jsx ts tsx json jsonl yaml yml toml xml html htm css scss sass less svg '
    + 'py go rs c h cpp hpp java kt swift rb php sh bash zsh fish sql vue svelte '
    + 'png jpg jpeg gif webp avif ico bmp tif tiff mp3 mp4 wav ogg webm mov '
    + 'zip gz tar bz2 xz 7z rar exe dll so dylib wasm lock log ini cfg conf env').split(' '));

function isTechnicalToken(token) {
    if (!/[\p{L}\p{N}]/u.test(token)) return false;
    if (token.includes('_') || token.includes('\\')) return true;
    // Lower camel case is an identifier shape, not sentence/title capitals.
    if (/^[a-z]+(?:[A-Z][a-z0-9]+)+$/u.test(token)) return true;
    if (/^(?:\.{0,2}\/|~\/|[A-Za-z]:\/)/u.test(token)) return true;
    const extension = /\.([A-Za-z0-9]+)$/u.exec(token)?.[1].toLowerCase();
    return fileExtensions.has(extension);
}

export function writingTechnicalRanges(text) {
    const ranges = writingURLRanges(text);
    for (const match of text.matchAll(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g)) {
        ranges.push({ from: match.index, to: match.index + match[0].length });
    }
    for (const match of text.matchAll(/[\p{L}\p{M}\p{N}_~./\\:-]+/gu)) {
        // Sentence punctuation after a file/path does not change its identity.
        const token = match[0].replace(/[.:]+$/u, '');
        if (isTechnicalToken(token)) ranges.push({ from: match.index, to: match.index + token.length });
    }
    return ranges;
}
