/**
 * Figaro-local Formulaic writing frames that the pinned Slopless rules miss.
 * Pure: projected prose in, textlint-shaped messages out. The Slopless adapter
 * merges these with package messages, so range validation, protected content,
 * paragraph caching and Ignore behave exactly as for package findings.
 * Every pattern stays inside one paragraph and favours precision: bare
 * corrections such as “It’s not red; it’s orange.” are deliberately not matched.
 */
export const writingFormulaicFramesVersion = '1';
export const writingFormulaicFrameRules = Object.freeze({
    'not-just-reframe': 'contrast', 'not-about-reframe': 'contrast', 'cliche-aphorism': 'contrast',
    'stock-opener': 'framing', 'fragment-question': 'fragment-question',
});

const apostrophe = '[\'’]';
// “isn’t”, “is not”, “it’s not”, “they’re not”.
const negated = `(?:\\b(?:is|are|was|were)n${apostrophe}t|\\b(?:is|are|was|were)\\s+not|${apostrophe}(?:s|re)\\s+not)`;
const pivot = '\\s*(?:[—–]|--|\\s-|;|,|:)\\s*';
const pronounCopula = `(?:it|they|this|that|he|she|we|you)(?:${apostrophe}(?:s|re)|\\s+(?:is|are|was|were))`;
const clause = '[^.!?;:—–\\n]';
const payoff = '([^.!?\\n]{1,80}?)(?=[.!?\\n]|$)';
const patterns = [
    // “X isn’t just a tool — it’s a mindset.” Additive “it’s also” and “not only … but also” stay quiet.
    ['not-just-reframe', new RegExp(`${negated}\\s+(?:just|merely|simply)\\s+(${clause}{1,60}?)${pivot}${pronounCopula}\\s+(?!also\\b|too\\b)${payoff}`, 'giu')],
    // “It’s not about collecting notes; it’s about cultivating understanding.”
    ['not-about-reframe', new RegExp(`\\b(?:it|this|that)(?:\\s+(?:is|was)n${apostrophe}t|\\s+(?:is|was)\\s+not|${apostrophe}s\\s+not)\\s+(?:(?:just|only|really)\\s+)?about\\s+(${clause}{1,80}?)${pivot}(?:${pronounCopula}|but|rather|instead)\\s+(?:(?:really|all|more|actually)\\s+)?about\\s+${payoff}`, 'giu')],
    // Fixed cliché pairs only; “a warning, not an error” is ordinary technical contrast.
    ['cliche-aphorism', /\b(?:an?|the)\s+(journey|marathon),?\s+not\s+(?:an?|the)\s+(destination|sprint)\b|\bnot\s+(?:an?|the)\s+(destination|sprint),?\s+but\s+(?:an?|the)\s+(journey|marathon)\b/giu],
    // “In today’s fast-paced digital landscape” (+ a directly following “it’s worth noting that”).
    ['stock-opener', new RegExp(`\\bIn\\s+(?:today${apostrophe}s\\s+(?:(?:TREND)[\\s,]+){0,3}(?:world|landscape|age|era)|today${apostrophe}s\\s+(?:(?:TREND)[\\s,]+){1,3}(?:environment|society|economy|climate|marketplace|market|business\\s+(?:world|landscape|environment))|(?:an?|this|the)\\s+(?:(?:TREND)[\\s,]+){1,3}(?:world|landscape|age|era|environment|marketplace))\\b(?:,\\s*(?:it${apostrophe}s|it\\s+is)\\s+(?:worth\\s+(?:noting|mentioning)|important\\s+to\\s+(?:note|remember))(?:\\s+that)?)?`
        .replaceAll('TREND', ['ever[- ](?:changing|evolving|shifting)', 'fast[- ]paced', '(?:rapidly|constantly)[- ](?:changing|evolving|shifting)', 'digital',
            'modern', 'competitive', 'hyper[- ]connected', 'interconnected', 'always[- ]on', 'dynamic', 'data[- ]driven', 'increasingly\\s+(?:digital|connected|complex|competitive)'].join('|')), 'giu')],
    // “The result? A graveyard of forgotten thoughts.” Only at a sentence start and answered on the same line.
    ['fragment-question', /(?<=^|[.!?]["”’)]?[ \t\n]+)(?:(?:And|So|But)[ \t]+)?(?:The|Your|My|Our|Their|His|Her)[ \t]+(?:(?:real|only|final|big|biggest|hidden|main)[ \t]+)?(?:result|catch|answer|problem|kicker|twist|secret|truth|reason|outcome|takeaway|verdict|upshot|payoff|solution|irony|lesson|(?:best|worst|hard|hardest)[ \t]+part|bottom[ \t]+line)\?(?=[ \t]+["“]?\p{Lu})/gu],
];
// Concrete references (numbers, names, dates) signal a factual correction rather than a slogan.
const concrete = text => /\d/u.test(text) || /(?<=\S\s+)(?!I\b)\p{Lu}/u.test(text);
const messages = {
    contrast: 'Formulaic contrast frame found. Consider stating the concrete claim directly.',
    framing: 'Stock opening found. Consider starting with the specific point.',
    'fragment-question': 'Rhetorical fragment question found. Consider stating the point directly.',
};

export function formulaicFrameMessages(text) {
    const found = [];
    for (const paragraph of text.matchAll(/[^\n]+(?:\n(?![\t ]*\n)[^\n]*)*/gu)) {
        for (const [rule, pattern] of patterns) {
            for (const match of paragraph[0].matchAll(pattern)) {
                if (match.slice(1).some(part => part !== undefined && concrete(part))) continue;
                const from = paragraph.index + match.index, to = from + match[0].replace(/[\s,;:—–-]+$/u, '').length;
                found.push({ from, to, rule });
            }
        }
    }
    return found.sort((a, b) => a.from - b.from || a.to - b.to).map(({ from, to, rule }) => {
        const before = text.slice(0, from), line = before.split('\n').length;
        return { type: 'lint', ruleId: `figaro-formulaic/${rule}`, message: messages[writingFormulaicFrameRules[rule]], severity: 1,
            index: from, line, column: from - before.lastIndexOf('\n'), range: [from, to] };
    });
}
