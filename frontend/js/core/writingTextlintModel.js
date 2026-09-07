/** Reviewed package inputs and source mapping, independent of runtime effects. */
export const writingTerminology = Object.freeze([
    'JavaScript', 'TypeScript', 'GitHub', 'GitLab', 'PostgreSQL',
    'GraphQL', 'WebAssembly', 'Markdown', 'SQLite',
    'MongoDB', 'MySQL', 'IndexedDB', 'OpenAPI', 'OpenSSH', 'OpenSSL', 'PowerShell',
    'WordPress', 'YouTube', 'LinkedIn', 'Cloudflare', 'CodePen', 'CodeSandbox', 'CoffeeScript',
    'AppleScript', 'Elasticsearch', 'FreeBSD', 'NixOS', 'PlayStation', 'JetBrains',
]);
export const writingTextlintVersions = Object.freeze({ pairs: '2.0.4', terminology: '5.2.16', kernel: '15.8.0', parser: '15.8.0' });
export const familiarWritingAcronyms = Object.freeze(['ATM', 'PIN',
    'ABOUT', 'AFTER', 'ALL', 'ALSO', 'AND', 'BEFORE', 'BOTH', 'BUT', 'CAN', 'DRAFT', 'DONE', 'EACH',
    'ELSE', 'END', 'ERROR', 'FALSE', 'FINAL', 'FIRST', 'FOR', 'FROM', 'GIVEN', 'HELLO', 'HERE', 'HOW',
    'LAST', 'LATER', 'MAY', 'MORE', 'MUST', 'NEVER', 'NEXT', 'NONE', 'NOT', 'NOW', 'ONLY', 'OPEN', 'OTHER',
    'OUR', 'READ', 'READY', 'REVIEW', 'SAVE', 'SHALL', 'START', 'STOP', 'TEST', 'THAN', 'THAT', 'THE',
    'THEN', 'THERE', 'THESE', 'THIS', 'THOSE', 'TRUE', 'UNTIL', 'USE', 'USER', 'USING', 'WHEN', 'WHERE',
    'WHICH', 'WHILE', 'WHO', 'WHY', 'WILL', 'WITH', 'WORD', 'WORDS', 'WORLD', 'WRITE', 'YES', 'YOU', 'YOUR']);
const terminologyPattern = new RegExp(`\\b(?:${writingTerminology.join('|')})\\b`, 'i');

export function writingTextlintNeeded(projection) {
    return terminologyPattern.test(projection.text) || /["([{«‹「（『｛［〚【]/u.test(projection.text);
}

export function writingTextlintProjection(projection) {
    const units = projection.units.map(unit => unit.escaped ? { ...unit, char: ' ', hidden: true } : unit);
    return { ...projection, units, text: units.map(unit => unit.char).join('') };
}

export function textlintWritingObservations(messages, projection) {
    return messages.flatMap(message => {
        let from, to, replacements = [], version;
        if (message.ruleId === '@textlint-rule/no-unmatched-pair') {
            // The pinned rule reports one character after the opening mark.
            // Check its native wording before shifting the underline back.
            const mark = message.message.match(/^Cannot find a pairing character for (.)./u)?.[1];
            from = message.index - 1; to = message.index;
            if (!mark || projection.text.slice(from, to) !== mark) return [];
            version = writingTextlintVersions.pairs;
        } else if (message.ruleId === 'textlint-rule-terminology') {
            [from, to] = message.fix?.range || [];
            if (!writingTerminology.includes(message.fix?.text)) return [];
            replacements = [message.fix.text]; version = writingTextlintVersions.terminology;
        } else return [];
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > projection.units.length
            || projection.units.slice(from, to).some(unit => unit.from < 0 || unit.hidden)) return [];
        return [{ engine: 'textlint', package: message.ruleId === '@textlint-rule/no-unmatched-pair'
            ? '@textlint-rule/textlint-rule-no-unmatched-pair' : message.ruleId,
        version, rule: message.ruleId, ruleId: message.ruleId, from, to, actual: projection.text.slice(from, to),
        message: message.message, replacements, severity: 'suggestion', evidenceFamily: 'unknown', native: message }];
    });
}

function acronymInitialsMatch(acronym, expansion) {
    const words = expansion.split(/[ \t\n-]+/u);
    const initial = word => /^ex/i.test(word) ? '[EX]' : word[0].toUpperCase();
    const matches = values => values.length >= acronym.length && new RegExp('^' + values.slice(-acronym.length).map(initial).join('') + '$', 'u').test(acronym);
    if (matches(words) || matches(words.filter(word => !/^(?:of|the|and|for|to)$/iu.test(word)))) return true;
    // A noun followed by “of” can take the equivalent attributive order:
    // automatic insertion of semicolons → automatic semicolon insertion.
    // Do not compare arbitrary bags of initials or invent an expansion.
    const of = words.findLastIndex(word => /^of$/iu.test(word));
    return of > 0 && of === words.length - 2
        && matches([...words.slice(0, of - 1), words[of + 1], words[of - 1]]);
}

/** Recognize bounded forward/reverse definitions, including plural acronyms. */
export function writingAcronymDefined(acronym, projection) {
    if (!/^[A-Z]{3,5}$/.test(acronym)) return false;
    const expansion = '[\\p{L}][\\p{L}’\'-]*(?:[ \\t\\n]+[\\p{L}][\\p{L}’\'-]*){1,7}';
    const patterns = [new RegExp(`(${expansion})[ \\t\\n]+\\(${acronym}s?\\)`, 'gu'),
        new RegExp(`\\b${acronym}s?[ \\t\\n]+\\((${expansion})\\)`, 'gu')];
    // Match inside each eligible block. A greedy expansion starting in a
    // preceding heading must not consume and hide a valid local definition.
    for (const region of projection.regions) {
        const text = projection.text.slice(region.start, region.end);
        for (const pattern of patterns) for (const match of text.matchAll(pattern)) {
            const from = region.start + match.index;
            if (projection.units.slice(from, from + match[0].length).some(unit => unit.from < 0 || unit.hidden)) continue;
            if (acronymInitialsMatch(acronym, match[1])) return true;
        }
    }
    return false;
}
