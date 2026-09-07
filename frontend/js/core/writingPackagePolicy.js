/** Conservative policy for package advice over the existing prose projection. */
import { writingInclusiveContext } from './writingContextModel.js';
export const readabilityOptions = Object.freeze({ age: 16, minWords: 15, threshold: 5 / 7 });
export const writingEditorialPolicyVersion = '4';

// Review a small set of generic roles/expressions, never infer a person's identity.
const inclusiveAlternatives = new Map([
    ['chairman', ['chair', 'chairperson']], ['chairwoman', ['chair', 'chairperson']],
    ['mankind', ['humankind', 'humanity']], ['manpower', ['workforce']],
    ['man-made', ['artificial', 'manufactured']], ['blacklist', ['blocklist']],
    ['whitelist', ['allowlist']],
]);
const inclusiveAdvice = new Set(['obviously', 'simply', 'easy', 'easily', 'clearly']);
// Broader contextual advice does not authorize an unchecked identity/title rewrite.
export const inclusiveAdvisoryRules = Object.freeze([
    'cameraman-camerawoman', 'cameramen-camerawomen', 'chairmen-chairwomen',
    'chick-cop-policeman', 'policemen-policewomen', 'fireman-firewoman',
    'firemen-firewomen', 'postman-postwoman', 'postmen-postwomen',
    'repairman-repairwoman', 'repairmen-repairwomen', 'saleslady-salesman',
    'salesmen-saleswomen', 'spokesman-spokeswoman', 'spokesmen-spokeswomen',
    'councilman-councilwoman', 'councilmen-councilwomen', 'foreman-forewoman',
    'foremen-forewomen', 'middleman-middlewoman', 'middlemen-middlewomen',
    'manhour', 'manhours', 'manmade',
    'manned', 'unmanned', 'blacklisted',
    'blacklisting', 'whitelisted', 'whitelisting',
    'basically', 'just', 'of-course',
    'everyone-knows', 'straightforward', 'obvious',
    'simple', 'easy', 'deaf-to',
    'handicapped-parking', 'wheelchair-bound', 'suffers-from-disabilities',
    'suffers-from-md',
]);

// Unknown pronunciations in these families are intentionally left to the author.
export function reviewedArticle(word) {
    if (/^(?:unicorns?|uniforms?|unions?|units?|united|unique|unilateral|universal|universities|university|universe|useful|useless|usual|user|users|utensils?|utilities|utility|european|eulogy|euphemism|euphoric|one|once)(?:['’-].*)?$/i.test(word)) return 'a';
    if (/^(?:honest|honesty|honou?r|honou?rable|heir|heiress|hour|hours|hourly)(?:['’-].*)?$/i.test(word)) return 'an';
    if (/^(?:u|eu|herb|historic|SQL|URL)/i.test(word)) return null;
    return undefined;
}

export function writingPackageObservation(raw, projection) {
    const { text, units, regions } = projection;
    if (raw.rule === 'retext-equality') {
        const word = raw.actual.toLowerCase();
        if (inclusiveAlternatives.has(word)) return { ...raw, replacements: inclusiveAlternatives.get(word), note: undefined };
        const context = writingInclusiveContext(raw, projection);
        return !context.skip && (inclusiveAdvice.has(word) || inclusiveAdvisoryRules.includes(raw.ruleId))
            ? { ...raw, replacements: [], note: context.note, adviceType: context.adviceType } : null;
    }
    if (raw.rule === 'retext-indefinite-article') {
        const following = text.slice(raw.to).match(/^[ \t\n]+([\p{L}][\p{L}’'-]*)/u)?.[1];
        // Reviewed exceptions are emitted independently, including errors the package misses.
        if (following && reviewedArticle(following) !== undefined) return null;
    }
    if (raw.rule === 'retext-readability') {
        if (!regions.some(region => region.type === 'paragraph' && region.start <= raw.from && region.end >= raw.to)) return null;
        if (units.slice(raw.from, raw.to).some(unit => unit.from < 0 || unit.hidden)) return null;
        return raw;
    }
    if (raw.rule !== 'retext-sentence-spacing') return raw;
    // Underline actual words around the gap, so both the location and Before/After
    // remain meaningful. Never bridge a masked quotation or a Markdown line break.
    const before = text.slice(0, raw.from).match(/\p{L}[\p{L}’'-]*[.!?]+$/u);
    const after = text.slice(raw.to).match(/^\p{L}[\p{L}’'-]*/u);
    if (!before || !after || !/^ {2,}$/.test(raw.actual) || text.slice(raw.from, raw.to) !== raw.actual) return null;
    const from = raw.from - before[0].length, to = raw.to + after[0].length;
    if (!regions.some(region => region.start <= from && region.end >= to)
        || units.slice(from, to).some(unit => unit.from < 0 || unit.hidden)) return null;
    return { ...raw, from, to, actual: text.slice(from, to), replacements: [before[0] + ' ' + after[0]],
        native: { ...raw.native, preferred: 'space' } };
}
