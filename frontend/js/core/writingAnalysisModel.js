import { writingGrammarRules, writingGrammarKinds, writingGrammarVersion, createWritingGrammarContext, writingGrammarReplacements } from './writingGrammarModel.js';
import { spellingSource } from './spellingModel.js';
import { applyWritingDecisions } from './writingDecisionsModel.js';
import { normalizeWritingLenses } from './writingLensesModel.js';
import { additionalWritingRulesVersion, longSentenceWordLimit, writingSentenceWordCount } from './writingAdditionalRules.js';
import { readabilityOptions, writingEditorialPolicyVersion } from './writingPackagePolicy.js';
import { writingTerminology, writingTextlintVersions, writingAcronymDefined, familiarWritingAcronyms } from './writingTextlintModel.js';
import { writingSloplessVersion, writingSloplessRules, writingSloplessKinds, writingSloplessConcepts } from './writingSloplessModel.js';
import { writingFormulaicFramesVersion, writingFormulaicFrameRules } from './writingFormulaicFrames.js';
import { spellingVocabularyVersion } from './spellingVocabulary.js';
import { writingAdvisoryContext, writingModifierConcern, writingPassiveNamesActor, writingSingleExclamationRun } from './writingContextModel.js';

export const writingMappingVersion = '27';
export const writingEngineConfiguration = Object.freeze({ mapping: writingMappingVersion, grammar: writingGrammarVersion, spellingVocabulary: spellingVocabularyVersion, vale: '3.20.0',
    writeGood: 'c9ceca7f574248a201d5524b001099c5626c7519', proselint: '8e24adbaa5dc6593b331f8bfab23c9af044af406',
    passive: '5.0.0', simplify: '8.0.0', repetition: '5.0.0', spelling: 'nspell-2.1.5', article: '5.0.0',
    contractions: '6.0.0', redundantAcronyms: '5.0.0', quotes: '6.0.2', equality: '7.1.0',
    sentenceSpacing: '6.0.0', diacritics: '5.0.0', readability: '8.0.0', readabilityOptions,
    textlint: writingTextlintVersions, slopless: { version: writingSloplessVersion, rules: writingSloplessRules },
    formulaicFrames: { version: writingFormulaicFramesVersion, rules: writingFormulaicFrameRules },
    terminology: writingTerminology, familiarAcronyms: familiarWritingAcronyms, ordinaryCapitalWords: 'dictionary-en-4.0.0',
    microsoft: '8b272ae9d6d6d82d54e3aafa8c1eb4550e4e971e', additionalRules: additionalWritingRulesVersion, editorial: writingEditorialPolicyVersion });
const concepts = {
    ...writingSloplessConcepts,
    ...Object.fromEntries(Object.values(writingGrammarKinds).map(kind => [kind, { lens: 'grammar', category: 'grammar', title: 'Check grammar', message: 'Review this construction in context.' }])),
    'style.modifier': { lens: 'direct', category: 'directness', title: 'Review filler word', message: 'Consider removing this word if it adds nothing, or replacing it with the detail it stands for.' },
    'style.vague-quantity': { lens: 'direct', category: 'directness', title: 'Be specific', message: 'How much, how often, or according to what? If you have a number, a date, or a source, consider stating it instead.' },
    'syntax.indirect-opening': { lens: 'direct', category: 'directness', title: 'Review indirect opening', message: 'Consider leading with the subject instead of “there is” or “there are” if that makes the point clearer.' },
    'style.opening-transition': { lens: 'direct', category: 'directness', title: 'Review opening transition', message: 'Keep “so” when it expresses a useful connection; consider removing it when it only delays the point.' },
    'style.archaism': { lens: 'plain', category: 'clarity', title: 'Review old-fashioned wording', message: 'Consider a familiar contemporary expression for a general audience. Keep period language when it serves your purpose.' },
    'style.word-choice': { lens: 'plain', category: 'clarity', title: 'Review word choice', message: 'This phrase matches a commonly confused expression. Check that the words convey the meaning you intend.' },
    'style.contradiction': { lens: 'plain', category: 'clarity', title: 'Review apparent contradiction', message: 'These words can appear to contradict each other. Keep the contrast when it expresses the distinction you intend.' },
    'style.disputed-term': { lens: 'plain', category: 'clarity', title: 'Review potentially ambiguous term', message: 'Readers may interpret this expression differently. Consider more precise wording if that matters here.' },
    'style.absolute-modifier': { lens: 'direct', category: 'directness', title: 'Review modified absolute', message: 'This modifier qualifies a word often treated as absolute. Check whether the degree is meaningful in this context.' },
    'syntax.passive': { lens: 'direct', category: 'directness', title: 'Possible passive construction', message: 'Consider naming the actor if that would make this sentence clearer.' },
    'style.wordiness': { lens: 'plain', category: 'conciseness', title: 'Shorter phrase', message: 'Consider this shorter alternative if it preserves your meaning.' },
    'lexicon.complex-word': { lens: 'plain', category: 'clarity', title: 'Simpler word', message: 'Consider a familiar alternative if it preserves your meaning.' },
    'grammar.repeated-word': { lens: 'repetition', category: 'grammar', title: 'Possible repeated word', message: 'Remove one occurrence if the repetition was accidental.' },
    'grammar.spelling': { lens: 'spelling', category: 'spelling', title: 'Check spelling', message: 'This word is outside the selected dictionaries. Check that a suggested spelling preserves the intended word.' },
    'style.consistency': { lens: 'consistency', category: 'consistency', title: 'Inconsistent wording', message: 'Choose one form to use consistently in this note.' },
    'style.capitalization': { lens: 'consistency', category: 'consistency', title: 'Inconsistent capitalization', message: 'Choose one capitalization to use consistently in this note.' },
    'grammar.article': { lens: 'grammar', category: 'grammar', title: 'Check “a” or “an”', message: 'Choose “a” or “an” to match the sound at the start of the following word.' },
    'grammar.punctuation-spacing': { lens: 'grammar', category: 'grammar', title: 'Space before punctuation', message: 'Remove the space before this punctuation mark in English prose.' },
    'grammar.repeated-comma': { lens: 'grammar', category: 'grammar', title: 'Repeated comma', message: 'Use a single comma here if the repetition was accidental.' },
    'readability.long-sentence': { lens: 'readability', category: 'readability', title: 'Long sentence', message: 'Consider splitting this sentence where the idea changes.' },
    'grammar.contraction': { lens: 'grammar', category: 'grammar', title: 'Check contraction apostrophe', message: 'Check the missing or misplaced apostrophe in this contraction.' },
    'style.redundant-acronym': { lens: 'plain', category: 'conciseness', title: 'Redundant acronym wording', message: 'The acronym already includes this word. Consider using the acronym on its own.' },
    'style.quotation': { lens: 'formulaic', category: 'style', title: 'Consistent quotation style', message: 'Match the prevailing quotation style and nesting convention in this note; the first occurrence breaks a tie.' },
    'style.apostrophe': { lens: 'formulaic', category: 'style', title: 'Consistent apostrophe style', message: 'Match the prevailing apostrophe style in this note; the first occurrence breaks a tie.' },
    'style.stock-phrase': { lens: 'plain', category: 'clarity', title: 'Consider more specific wording', message: 'This expression can sound clichéd or like corporate jargon. Consider saying concretely what you mean.' },
    'style.hedging': { lens: 'direct', category: 'directness', title: 'Review qualifying phrase', message: 'Consider removing this qualifier if it adds no meaning. Keep qualifications that accurately express uncertainty.' },
    'style.hyperbole': { lens: 'formulaic', category: 'style', title: 'Review emphatic punctuation', message: 'Repeated exclamation or question marks add emphasis. Consider a single mark if that better suits your tone.' },
    'style.reader-assumption': { lens: 'direct', category: 'directness', title: 'Review reader assumption', message: 'This wording can assume that readers find a task easy or already know the answer. Describe the steps or prerequisites when useful; keep factual descriptions of difficulty or clarity.' },
    'language.inclusive': { lens: 'inclusive', category: 'inclusivity', title: 'Consider inclusive wording', message: 'This wording may be insensitive or exclusionary in some contexts. Review whether an alternative fits your intended meaning.' },
    'style.sentence-spacing': { lens: 'consistency', category: 'consistency', title: 'Space between sentences', message: 'Consider using one space between sentences on the same line. Intentional line breaks are preserved.' },
    'style.diacritics': { lens: 'consistency', category: 'consistency', title: 'Consider an accented spelling', message: 'This name or borrowed word can take an accent. Apply the alternative only if it fits the intended name and your preferred spelling.' },
    'readability.complex-sentence': { lens: 'readability', category: 'readability', title: 'Review sentence readability', message: 'Several readability formulas suggest this sentence may be difficult to follow. Consider simpler wording or splitting an idea; these estimates do not measure writing quality.' },
    'grammar.unmatched-pair': { lens: 'grammar', category: 'grammar', title: 'Check paired punctuation', message: 'This opening mark may be missing its matching closing mark. Review the surrounding sentence before changing punctuation.' },
    'style.terminology': { lens: 'consistency', category: 'consistency', title: 'Technical name spelling', message: 'Consider the established spelling of this technical name if it is the product or technology you mean.' },
    'clarity.undefined-acronym': { lens: 'plain', category: 'clarity', title: 'Consider explaining this acronym', message: 'This acronym has no recognized definition in the prose. Consider spelling it out if your readers may not know it.' },
};
const rules = {
    ...writingSloplessKinds,
    ...writingGrammarKinds,
    'write-good.Cliches': 'style.stock-phrase', 'write-good.Illusions': 'grammar.repeated-word',
    'write-good.So': 'style.opening-transition', 'write-good.ThereIs': 'syntax.indirect-opening', 'write-good.Weasel': 'style.modifier',
    'proselint.Airlinese': 'style.stock-phrase', 'proselint.Jargon': 'style.stock-phrase',
    'proselint.Archaisms': 'style.archaism', 'proselint.Malapropisms': 'style.word-choice',
    'proselint.Oxymorons': 'style.contradiction', 'proselint.Skunked': 'style.disputed-term',
    'proselint.Uncomparables': 'style.absolute-modifier', 'proselint.Very': 'style.modifier',
    'proselint.RASSyndrome': 'style.redundant-acronym', 'proselint.Spelling': 'style.consistency',
    'write-good.Passive': 'syntax.passive', 'retext-passive': 'syntax.passive',
    'write-good.TooWordy': 'style.wordiness', 'retext-simplify': 'style.wordiness',
    'retext-repeated-words': 'grammar.repeated-word', 'figaro-spelling': 'grammar.spelling',
    'retext-indefinite-article': 'grammar.article',
    'figaro-reviewed-article': 'grammar.article',
    'figaro-consistent-terms': 'style.consistency', 'figaro-consistent-capitalization': 'style.capitalization',
    'figaro-punctuation-spacing': 'grammar.punctuation-spacing', 'figaro-repeated-comma': 'grammar.repeated-comma',
    'figaro-long-sentence': 'readability.long-sentence',
    'retext-contractions': 'grammar.contraction', 'retext-redundant-acronyms': 'style.redundant-acronym',
    'retext-quotes': 'style.quotation', 'retext-equality': 'language.inclusive',
    'proselint.Cliches': 'style.stock-phrase', 'proselint.CorporateSpeak': 'style.stock-phrase',
    'proselint.Hedging': 'style.hedging', 'proselint.Hyperbole': 'style.hyperbole',
    'retext-sentence-spacing': 'style.sentence-spacing', 'retext-diacritics': 'style.diacritics',
    'retext-readability': 'readability.complex-sentence',
    '@textlint-rule/no-unmatched-pair': 'grammar.unmatched-pair', 'textlint-rule-terminology': 'style.terminology',
    'Microsoft.Adverbs': 'style.modifier', 'Microsoft.Jargon': 'style.stock-phrase',
    'Microsoft.Passive': 'syntax.passive', 'Microsoft.SentenceLength': 'readability.long-sentence', 'Microsoft.Wordiness': 'style.wordiness',
    'Microsoft.Acronyms': 'clarity.undefined-acronym',
};
const advisoryOnly = new Set(['style.reader-assumption', 'style.vague-quantity', 'syntax.passive', 'readability.long-sentence', 'readability.complex-sentence', 'style.stock-phrase', 'style.hedging', 'style.hyperbole', 'grammar.unmatched-pair', 'clarity.undefined-acronym']);
const reviewed = new Set(['in order to', 'due to the fact that', 'at this point in time', 'utilize', 'utilizes', 'utilized', 'utilizing']);
// Plain-language matches without a reviewed replacement are shown only when the
// wording is genuinely wordy: a multi-word phrase, or a formal single word.
// Everyday words such as “previous”, “require” or “delete” are already plain.
const formalWords = new Set(['facilitate', 'facilitates', 'facilitated', 'facilitating', 'commence', 'commences', 'commenced',
    'endeavor', 'endeavour', 'endeavors', 'endeavours', 'ascertain', 'ascertained', 'terminate', 'terminated', 'initiate',
    'initiated', 'utilise', 'utilises', 'utilised', 'numerous', 'subsequently', 'aforementioned', 'henceforth', 'heretofore',
    'whereby', 'therein', 'notwithstanding', 'pursuant', 'expedite', 'expedited', 'remuneration', 'cognizant', 'disseminate',
    'disseminated', 'procure', 'procured', 'inception', 'whilst', 'prior']);
function plainAdviceUseful(actual) {
    const words = clean(actual).split(' ');
    if (words.length === 1) return formalWords.has(words[0]);
    return !/^(?:it|this|that|there) (?:is|was)$/u.test(words.join(' '));
}
const clean = text => text.toLowerCase().replace(/\s+/g, ' ').trim();
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const selectedWritingLenses = preferences => {
    const p = normalizeWritingLenses(preferences);
    return p.lenses;
};
export function writingLanguage(defaultLanguage, override) {
    const raw = override === undefined ? defaultLanguage : override;
    const value = typeof raw === 'string' ? raw.toLowerCase() : '';
    return ({ none: 'none', en: 'en-US', 'en-us': 'en-US', 'en-gb': 'en-GB' })[value] || 'unsupported';
}
export function mapWritingRange(projection, from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > projection.units.length) return null;
    const units = projection.units.slice(from, to);
    if (units.some(unit => unit.from < 0 || unit.hidden)) return null;
    const start = units[0].from, end = units.at(-1).to;
    const editable = units.every((unit, i) => unit.safe && (!i || units[i - 1].to === unit.from));
    return { from: start, to: end, editable };
}
export function valeWritingObservations(output, projection) {
    const record = typeof output === 'string' ? JSON.parse(output) : output;
    if (!record || Array.isArray(record) || typeof record !== 'object') throw new Error('Invalid writing output');
    const lines = projection.text.split('\n');
    const lineOffsets = new Map();
    const grammarContext = createWritingGrammarContext(projection);
    const starts = []; let offset = 0;
    for (const line of lines) { starts.push(offset); offset += line.length + 1; }
    return Object.values(record).flatMap(alerts => {
        if (!Array.isArray(alerts)) throw new Error('Invalid writing observations');
        return alerts.flatMap(alert => {
            const line = lines[alert.Line - 1];
            const span = alert.Span;
            if (line !== undefined && !lineOffsets.has(alert.Line)) {
                const offsets = [0];
                for (const char of line) offsets.push(offsets[offsets.length - 1] + char.length);
                lineOffsets.set(alert.Line, offsets);
            }
            const offsets = lineOffsets.get(alert.Line);
            const valid = offsets && Array.isArray(span) && span.length === 2
                && span.every(Number.isInteger) && span[0] > 0 && span[1] >= span[0] && span[1] < offsets.length;
            let from = valid ? starts[alert.Line - 1] + offsets[span[0] - 1] : -1;
            let to = valid ? starts[alert.Line - 1] + offsets[span[1]] : -1;
            let actual = alert.Match;
            if (alert.Check === 'Microsoft.SentenceLength') {
                // Vale anchors this occurrence rule to the first word. The advice
                // concerns its whole sentence, using the existing prose boundaries.
                const sentence = (projection.sentences || []).find(item => item.start <= from && item.end >= to);
                if (!valid || !sentence || projection.text.slice(from, to) !== actual) { from = -1; to = -1; }
                else {
                    if (!projection.regions.some(region => region.type === 'paragraph' && region.start <= sentence.start && region.end >= sentence.end)
                        || !mapWritingRange(projection, sentence.start, sentence.end)) return [];
                    from = sentence.start; to = sentence.end; actual = projection.text.slice(from, to);
                    if (writingSentenceWordCount(actual) < longSentenceWordLimit) return [];
                }
            }
            const grammar = writingGrammarRules[alert.Check];
            if (grammar && (projection.text.slice(from, to) !== actual
                || !(grammar.context === 'local' ? mapWritingRange(projection, from, to) : grammarContext(from, to)))) return [];
            return { engine: 'vale', version: '3.20.0', rule: alert.Check, from, to,
                ...(grammar ? { intent: alert.Check } : {}),
                package: grammar ? (alert.Check.startsWith('Harper.') ? 'Harper' : 'FigaroGrammar') : alert.Check?.startsWith('Microsoft.') ? 'Microsoft' : alert.Check?.startsWith('proselint.') ? 'proselint' : 'write-good',
                packageVersion: grammar ? writingGrammarVersion : alert.Check?.startsWith('Microsoft.') ? writingEngineConfiguration.microsoft : alert.Check?.startsWith('proselint.') ? writingEngineConfiguration.proselint : writingEngineConfiguration.writeGood, evidenceFamily: 'unknown',
                actual, message: alert.Message, severity: alert.Severity, replacements: grammar ? writingGrammarReplacements(alert) : [], native: alert };
        });
    });
}
function occurrenceKey(diagnostic) { return `${diagnostic.kind}:${diagnostic.from}:${diagnostic.to}:${diagnostic.intent}`; }
function matchCase(replacement, actual) {
    if (actual.length > 1 && actual === actual.toUpperCase()) return replacement.toUpperCase();
    return /^\p{Lu}/u.test(actual) ? replacement[0]?.toUpperCase() + replacement.slice(1) : replacement;
}
function quotationFix(raw, range, source, projection) {
    const marks = raw.quotationMarks;
    if (!Array.isArray(marks) || !marks.length) return [];
    const edits = marks.map(mark => ({ ...mark, range: mapWritingRange(projection, mark.from, mark.to) }));
    if (edits.some(mark => !mark.range?.editable || mark.from < raw.from || mark.to > raw.to
        || mark.range.to - mark.range.from !== 1 || !/^["“”'‘’]$/u.test(mark.replacement) || !/^["“”'‘’]$/u.test(mark.actual)
        || source.slice(mark.range.from, mark.range.to) !== mark.actual)) return [];
    edits.sort((a, b) => b.range.from - a.range.from);
    if (edits.some((mark, i) => i && mark.range.to > edits[i - 1].range.from)) return [];
    const expected = source.slice(range.from, range.to);
    let replacement = expected;
    for (const mark of edits) replacement = replacement.slice(0, mark.range.from - range.from) + mark.replacement + replacement.slice(mark.range.to - range.from);
    return [{ from: range.from, to: range.to, expected, replacement }];
}
function normalizeObservation(raw, source, projection, spelling) {
    let kind = rules[raw.rule];
    if (!kind) return { raw, rejected: 'Unknown writing rule' };
    if (raw.rule === 'retext-quotes') {
        projection = projection.typography || projection;
        if (raw.ruleId === 'apostrophe') kind = 'style.apostrophe';
    }
    const word = raw.engine === 'spelling' && spelling.words.get(`${raw.from}:${raw.to}`);
    const range = raw.engine === 'spelling' ? word && { from: word.from, to: word.to, editable: word.editable !== false } : mapWritingRange(projection, raw.from, raw.to);
    if (!range || range.from < 0 || range.to > source.length || range.to <= range.from) return { raw, rejected: 'Unmappable source range' };
    const referenceLabel = spelling.readOnly.some(label => label.from < range.to && label.to > range.from);
    if (referenceLabel) range.editable = false;
    const actual = raw.actual || source.slice(range.from, range.to);
    if (raw.engine === 'spelling' && actual !== word.word) return { raw, rejected: 'Spelling text disagrees with its range' };
    if (raw.engine !== 'spelling' && typeof raw.actual === 'string' && clean(projection.text.slice(raw.from, raw.to)) !== clean(raw.actual)) return { raw, rejected: 'Analyzer text disagrees with its range' };
    if (kind === 'style.wordiness' && /^utiliz/i.test(actual)) kind = 'lexicon.complex-word';
    const indirectPlain = kind === 'style.wordiness' && /^there (?:is|are)$/iu.test(actual);
    if (indirectPlain) kind = 'syntax.indirect-opening';
    // Reader-assumption tone is directness advice; saved inclusive decisions still apply.
    const readerAssumption = kind === 'language.inclusive' && raw.adviceType === 'reader-assumption';
    if (readerAssumption) kind = 'style.reader-assumption';
    // Vague degree and frequency ask for the missing number or source.
    const vagueQuantity = kind === 'style.modifier' && writingModifierConcern(actual) === 'precision';
    if (vagueQuantity) kind = 'style.vague-quantity';
    if (kind === 'clarity.undefined-acronym' && !spelling.acronyms.has(actual)) spelling.acronyms.set(actual, writingAcronymDefined(actual, projection));
    const phraseNeedsReview = ['style.wordiness', 'lexicon.complex-word'].includes(kind) && !reviewed.has(clean(actual));
    const suppressed = kind === 'clarity.undefined-acronym' && (familiarWritingAcronyms.includes(actual) || projection.ordinaryCapitals?.includes(actual)) ? 'Familiar acronym or ordinary word'
        : kind === 'clarity.undefined-acronym' && spelling.acronyms.get(actual) ? 'Acronym defined in prose'
            : kind === 'formulaic.exclamation-density' && writingSingleExclamationRun(raw, projection) ? 'Covered by emphatic punctuation advice'
                : writingAdvisoryContext(kind, raw, projection) ? 'Wording has an established meaning in this context'
                    : phraseNeedsReview && !plainAdviceUseful(actual) ? 'Already plain wording' : '';
    const fixes = referenceLabel || raw.package === 'slopless' || phraseNeedsReview ? [] : kind === 'style.quotation' ? quotationFix(raw, range, source, projection)
        : !suppressed && range.editable && !advisoryOnly.has(kind) && !kind.startsWith('formulaic.')
            && (!writingGrammarRules[raw.rule] || !/[\r\n]/u.test(source.slice(range.from, range.to)))
            ? [...new Set(raw.replacements || [])].filter(value => typeof value === 'string' && value.length > 0)
                .map(value => ({ from: range.from, to: range.to, expected: source.slice(range.from, range.to), replacement: ['style.capitalization', 'style.sentence-spacing', 'style.terminology'].includes(kind) ? value : matchCase(value, actual) }))
            : [];
    const presentation = { ...concepts[kind], lens: raw.package === 'slopless' ? 'formulaic' : indirectPlain ? 'plain' : concepts[kind].lens };
    if (raw.rule === 'slopless/word-repetition' && raw.detail) presentation.message = `${raw.detail} ${presentation.message}`;
    if (phraseNeedsReview) presentation.message = 'Consider whether simpler wording would preserve your meaning. This match needs contextual review; no automatic replacement is offered.';
    if (writingGrammarRules[raw.rule]) { presentation.title = writingGrammarRules[raw.rule].title; presentation.message = raw.message || presentation.message; }
    if (raw.engine === 'figaro' && typeof raw.message === 'string') presentation.message = raw.message;
    if (kind === 'language.inclusive' && typeof raw.note === 'string' && raw.note.trim()) presentation.message = `${presentation.message} ${raw.note.trim()}`;
    if (referenceLabel) presentation.message += ' This label also identifies its Markdown reference; edit the label and reference together.';
    return { ...range, raw, kind, actual, sourceText: source.slice(range.from, range.to), suppressed, severity: 'advisory', intent: raw.intent || 'review', fixes,
        ...(kind === 'syntax.indirect-opening' && /^there (?:is|are)$/iu.test(actual) ? { legacyKind: 'style.wordiness' } : {}),
        ...(readerAssumption ? { legacyKind: 'language.inclusive' } : {}),
        // Saved Ignore decisions made while these were “vague modifier” advice still apply.
        ...(vagueQuantity ? { legacyKind: 'style.modifier' } : {}),
        // Apostrophes were also reported by the former Formulaic curly-punctuation rule.
        ...(kind === 'style.apostrophe' ? { legacyKind: 'formulaic.curly-punctuation' } : {}),
        ...(kind === 'grammar.spelling' ? { bulkSafe: raw.bulkSafe === true } : {}), ...presentation };
}
function equivalent(left, right, candidates, source) {
    if (left.kind !== right.kind || left.intent !== right.intent) return false;
    if (left.from === right.from && left.to === right.to) return true;
    if (left.kind !== 'syntax.passive') return false;
    const wider = left.to - left.from > right.to - right.from ? left : right;
    const narrow = wider === left ? right : left;
    if (narrow.from < wider.from || narrow.to > wider.to || narrow.to !== wider.to) return false;
    // A wider auxiliary + participle must identify this one terminal verb phrase.
    const prefix = source.slice(wider.from, narrow.from).trim();
    if (!/^(?:am|are|were|being|is|been|was|be)(?:\s+(?:being|been|be))?$/iu.test(prefix)) return false;
    for (let from = wider.from; from < wider.to; from++) {
        if ((candidates.get(from) || []).some(other => other !== narrow && other !== wider && other.kind === left.kind
            && other.to <= wider.to && (other.from !== narrow.from || other.to !== narrow.to)
            && !(other.from === wider.from && other.to === wider.to))) return false;
    }
    return true;
}
function commaSpacingEditKey(entry) {
    if (entry.rejected || entry.suppressed || entry.fixes.length !== 1) return null;
    const { from, expected, replacement } = entry.fixes[0];
    // Compare the edit itself, not the word/gap context chosen by each engine.
    // Only horizontal whitespace around one comma may participate.
    if (/[\r\n]/u.test(expected + replacement) || expected.split(',').length !== 2
        || expected.replace(/[ \t]/gu, '') !== replacement.replace(/[ \t]/gu, '')) return null;
    let start = 0, end = expected.length, replacementEnd = replacement.length;
    while (start < end && start < replacementEnd && expected[start] === replacement[start]) start++;
    while (end > start && replacementEnd > start && expected[end - 1] === replacement[replacementEnd - 1]) {
        end--; replacementEnd--;
    }
    if (start === end && start === replacementEnd) return null;
    return JSON.stringify([from + start, from + end, replacement.slice(start, replacementEnd)]);
}
// A single actorless passive is usually a fine choice. Keep passive advice
// where it is actionable: the sentence names its actor (“…by Maya”), or
// passives cluster so that nobody acts across a sentence or paragraph.
const passiveSentenceCluster = 2, passiveParagraphCluster = 3;
function focusPassiveFindings(findings, source, regions, sentences) {
    const passives = findings.filter(finding => finding.kind === 'syntax.passive' && !finding.suppressed);
    const count = (ranges, finding) => {
        const range = ranges.find(item => item.from <= finding.from && item.to >= finding.to);
        return range ? passives.filter(other => other.from >= range.from && other.to <= range.to).length : 1;
    };
    for (const finding of passives) {
        if (writingPassiveNamesActor(source.slice(finding.to, finding.to + 256))) {
            finding.message = 'This sentence names who acts. Consider making that actor the subject.';
        } else if (count(sentences, finding) >= passiveSentenceCluster || count(regions, finding) >= passiveParagraphCluster) {
            finding.message = 'Several passive constructions close together can hide who does what. Consider naming the actor in at least one.';
        } else {
            finding.suppressed = 'Single passive without a named actor';
        }
    }
}

export function resolveWritingFindings({ source, projection = { units: [], regions: [], sentences: [] }, observations = [], preferences, decisions = [], language = preferences?.language }) {
    const p = normalizeWritingLenses(preferences);
    const selected = selectedWritingLenses(p);
    const eligibility = observations.length ? spellingSource(source) : { words: [], readOnly: [] };
    const spelling = { words: new Map(eligibility.words.map(word => [`${word.from}:${word.to}`, word])), readOnly: eligibility.readOnly, acronyms: new Map() };
    const evidence = observations.map(raw => normalizeObservation(raw, source, projection, spelling));
    // A doubled article needs removal, not an overlapping a/an sound change.
    const doubledArticles = evidence.filter(entry => entry.raw.rule === 'Harper.AnAnother' && !entry.rejected);
    for (const entry of evidence) {
        if (entry.kind === 'grammar.article' && doubledArticles.some(other => other.from <= entry.from && other.to >= entry.to)) entry.suppressed = 'Covered by the doubled-article correction';
    }
    const commaCorrections = new Map();
    for (const entry of evidence) {
        if (entry.raw.rule !== 'figaro-punctuation-spacing' || entry.intent !== 'review') continue;
        const key = commaSpacingEditKey(entry);
        if (key) commaCorrections.set(key, entry);
    }
    for (const entry of evidence) {
        if (entry.raw.rule !== 'FigaroGrammar.CommaFixes' || entry.intent !== entry.raw.rule) continue;
        const local = commaCorrections.get(commaSpacingEditKey(entry));
        if (!local) continue;
        // Use the existing local occurrence and action; retain native raw evidence.
        Object.assign(entry, { kind: local.kind, intent: local.intent, from: local.from, to: local.to,
            actual: local.actual, sourceText: local.sourceText, fixes: local.fixes });
    }
    const candidates = evidence.filter(entry => !entry.rejected).sort((a, b) => a.from - b.from || b.to - a.to || compare(a.raw.rule, b.raw.rule) || compare(JSON.stringify(a.raw), JSON.stringify(b.raw)));
    const byStart = new Map(), intents = new Map();
    for (const entry of candidates) {
        if (!byStart.has(entry.from)) byStart.set(entry.from, []);
        byStart.get(entry.from).push(entry);
        const range = `${entry.kind}:${entry.from}:${entry.to}`;
        if (!intents.has(range)) intents.set(range, new Set());
        intents.get(range).add(entry.intent);
    }
    const findings = [];
    const byEnd = new Map();
    for (const entry of candidates) {
        const bucketKey = `${entry.kind}:${entry.to}`;
        const bucket = byEnd.get(bucketKey) || [];
        let found = bucket.find(item => item.members.every(member => equivalent(member, entry, byStart, source)));
        if (!found) {
            found = { ...entry, id: occurrenceKey(entry), members: [], sources: [], fixes: [], lenses: [] };
            findings.push(found); bucket.push(found); byEnd.set(bucketKey, bucket);
        }
        found.members.push(entry);
        if (!found.lenses.includes(entry.lens)) found.lenses.push(entry.lens);
        if (!found.sources.some(raw => JSON.stringify(raw) === JSON.stringify(entry.raw))) found.sources.push(entry.raw);
        for (const fix of selected.includes(entry.lens) ? entry.fixes : []) if (!found.fixes.some(other => JSON.stringify(other) === JSON.stringify(fix))) found.fixes.push(fix);
    }
    for (const finding of findings) {
        if (intents.get(`${finding.kind}:${finding.from}:${finding.to}`).size > 1) {
            finding.fixes = []; finding.message = 'These recommendations conflict; review the wording before changing it.';
        }
        finding.fixes.sort((a, b) => compare(a.replacement, b.replacement));
    }
    const sentenceRanges = (projection.sentences || []).map(item => mapWritingRange(projection, item.start, item.end)).filter(Boolean);
    focusPassiveFindings(findings, source, projection.regions || [], sentenceRanges);
    applyWritingDecisions(findings, decisions, source, language);
    const visible = findings.filter(item => !item.suppressed && item.lenses.some(lens => selected.includes(lens)));
    for (const item of visible) item.lens = item.lenses.find(lens => selected.includes(lens));
    const groups = new Map();
    for (const finding of visible) {
        const region = projection.regions.find(item => item.from <= finding.from && item.to >= finding.to) || { from: finding.from, to: finding.to };
        const sentence = sentenceRanges.find(item => item && item.from >= region.from && item.to <= region.to && item.from <= finding.from && item.to >= finding.to);
        const span = sentence || region;
        const key = `${span.from}:${span.to}`;
        if (!groups.has(key)) groups.set(key, { id: key, from: span.from, to: span.to, text: source.slice(span.from, span.to), findings: [] });
        groups.get(key).findings.push(finding);
    }
    const ordered = [...groups.values()];
    ordered.sort((a, b) => a.from - b.from);
    for (const group of ordered) group.findings.sort((a, b) => a.from - b.from || compare(a.kind, b.kind) || compare(a.id, b.id));
    return { groups: ordered, findings, evidence, count: visible.length, rejected: evidence.filter(item => item.rejected).length };
}

/** Map session decisions only through an unambiguous unchanged prefix/suffix. */
export function remapWritingDismissals(records, before, after) {
    if (before === after) return records;
    let start = 0; while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let suffix = 0;
    while (suffix < before.length - start && suffix < after.length - start && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
    const delta = after.length - before.length;
    return records.flatMap(record => {
        const inPrefix = record.to <= start, inSuffix = record.from >= before.length - suffix;
        if (!inPrefix && !inSuffix) return [];
        const shift = inPrefix ? 0 : delta;
        const contextStart = Math.max(inPrefix ? 0 : before.length - suffix, record.from - 32);
        const contextEnd = Math.min(inPrefix ? start : before.length, record.to + 32);
        const context = before.slice(contextStart, contextEnd);
        // Repeated insertion/deletion can admit several equally valid text diffs.
        // Keep continuity only when the unchanged nearby text identifies one occurrence.
        if (after.indexOf(context) !== contextStart + shift || after.lastIndexOf(context) !== contextStart + shift) return [];
        return [{ ...record, from: record.from + shift, to: record.to + shift }];
    });
}
export function validateWritingFix(snapshot, current, fix) {
    return Boolean(snapshot && current && snapshot.id === current.id && snapshot.revision === current.revision
        && snapshot.configuration === current.configuration && fix && Number.isInteger(fix.from) && Number.isInteger(fix.to)
        && fix.from >= 0 && fix.to > fix.from && fix.to <= current.source.length
        && typeof fix.replacement === 'string' && current.source.slice(fix.from, fix.to) === fix.expected);
}
