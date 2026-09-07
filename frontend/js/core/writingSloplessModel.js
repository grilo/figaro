/** Reviewed Slopless policy. Package execution belongs to the textlint adapter. */
export const writingSloplessVersion = '0.2.38';
export const writingSloplessRules = Object.freeze({
    cliches: 'stock-phrase', 'corporate-speak': 'stock-phrase', wordiness: 'wordiness',
    simplicity: 'complex-density', redundancy: 'redundancy', 'exclamation-density': 'exclamation-density',
    'word-repetition': 'word-frequency', 'hedge-stacking': 'hedge-density', 'softening-language': 'softening',
    'em-dashes': 'em-dash', 'smart-quotes': 'curly-punctuation',
    'boilerplate-framing': 'framing', 'generic-signposting': 'framing',
    'negation-reframe': 'contrast', 'contrastive-aphorism': 'contrast', 'blame-reframe': 'contrast',
    'universalizing-claims': 'generalization', 'authority-padding': 'authority',
    'boilerplate-conclusion': 'conclusion', 'summative-closer': 'conclusion',
    'formulaic-challenges': 'challenges', 'lesson-framing': 'lesson', 'observer-guidance': 'observer',
    'response-wrapper': 'assistant', 'llm-disclaimer': 'assistant',
    'formal-transition-density': 'transitions', 'repeated-sentence-starts': 'sentence-starts',
    'empty-emphasis': 'emphasis', 'superficial-analysis': 'analysis', 'semantic-thinness': 'abstract',
});

const guidance = {
    'stock-phrase': ['Consider more specific wording', 'This expression can sound clichéd or like corporate jargon. Consider saying concretely what you mean.', 'Let’s get the ball rolling.', 'Let’s start the project.'],
    wordiness: ['Shorter phrase', 'Consider shorter wording if it preserves your meaning. This pattern does not establish that the phrase is wrong.', 'We left in order to catch the train.', 'We left to catch the train.'],
    'complex-density': ['Review clustered complex words', 'Several words in a short span have simpler alternatives. Keep specialist terms when their precision helps your audience.', 'We utilize numerous methods to facilitate implementation.', 'We use several methods to help put the plan into practice.'],
    redundancy: ['Review redundant phrase', 'Part of this phrase may repeat its meaning. Keep the wording if the repetition clarifies a distinction.', 'We agreed on future plans.', 'We agreed on plans.'],
    'exclamation-density': ['Review frequent exclamation marks', 'This paragraph contains several exclamation marks. Consider reducing them if the emphasis distracts from your point; expressive writing may need them.', 'The draft is ready! We finished early!', 'The draft is ready. We finished early!'],
    'word-frequency': ['Review frequent word use', 'A word appears more than five times in this paragraph. Consider reducing repetition when it distracts; keep a consistent technical term when synonyms would confuse.', 'The plan covers costs. The plan covers dates. The plan covers roles.', 'The plan covers costs, dates, and roles.'],
    'hedge-density': ['Review stacked qualifications', 'Several nearby words express uncertainty. Consider whether each qualification adds meaning; preserve the uncertainty supported by your evidence.', 'Maybe this might possibly help.', 'This might help.'],
    softening: ['Review layered qualifications', 'This sentence uses several forms of qualification. Consider making their scope more specific, while keeping the uncertainty and limitations your evidence requires.', 'Some people might generally benefit from this change.', 'In the trial, two participants reported a benefit; effects for other people remain uncertain.'],
    'em-dash': ['Review em-dash style', 'This em dash has no surrounding spaces. Consider a spaced dash or punctuation that fits the sentence; keep it if this is your preferred style.', 'The draft is ready—we can send it.', 'The draft is ready; we can send it.'],
    'curly-punctuation': ['Review curly punctuation', 'This is a curly quotation mark or apostrophe. Consider straight punctuation if that is your preferred style. Curly punctuation is valid typography.', 'She said “ready”.', 'She said "ready".'],
    framing: ['Review introductory framing', 'Consider starting with the specific point if this introduction adds no useful context.', 'Let me be honest: the deadline is unrealistic.', 'The deadline is unrealistic.'],
    contrast: ['Review formulaic contrast', 'Consider stating the concrete claim directly. Keep the contrast if the distinction helps your reader.', 'We do not sell software. We sell outcomes.', 'Our software helps teams track delivery dates.'],
    generalization: ['Review sweeping claim', 'Consider naming the people or circumstances this claim applies to. Keep broad wording when the evidence supports it.', 'Everyone knows that meetings waste time.', 'Our team found that the daily meeting repeated the written update.'],
    authority: ['Review appeal to authority', 'Consider naming the source or explaining the evidence behind this claim. This check does not verify citations.', 'Experts agree that this is the best approach.', 'Name the relevant experts and explain which evidence supports the approach.'],
    conclusion: ['Review stock conclusion', 'Consider ending with the concrete result or next step if this summary adds nothing new.', 'In conclusion, the draft is ready.', 'The draft is ready for review.'],
    challenges: ['Review generic challenge framing', 'Consider naming the actual limitation and response instead of using a general challenge-and-opportunity conclusion.', 'Despite the challenges, the future is bright.', 'Two tests still fail. We will investigate them tomorrow.'],
    lesson: ['Review lesson framing', 'Consider stating the lesson directly if this introduction only announces it.', 'The lesson is clear: check the totals.', 'Check the totals before sending the invoice.'],
    observer: ['Review reader guidance', 'Consider replacing this bridge with the evidence or observation it introduces.', 'A closer look reveals that costs rose.', 'Costs rose by 12% in June.'],
    assistant: ['Review assistant response wording', 'This resembles an assistant response wrapper or disclaimer. Remove it if it is leftover drafting text; keep it when it is the subject of your note.', 'As an AI language model, I cannot inspect the file.', 'I cannot inspect the file.'],
    transitions: ['Review repeated transitions', 'Several nearby sentences begin with formal transitions. Keep the transitions that explain a relationship and consider removing the rest.', 'Moreover, costs fell. Furthermore, sales rose. Additionally, hiring resumed.', 'Costs fell and sales rose. Hiring also resumed.'],
    'sentence-starts': ['Review repeated sentence openings', 'Several nearby sentences share an opening. Consider combining related points or varying the openings; deliberate repetition can be effective.', 'We can save time. We can reduce errors. We can finish sooner.', 'We can save time and reduce errors, helping us finish sooner.'],
    emphasis: ['Review empty emphasis', 'Consider replacing this emphasis with the specific point it is meant to emphasize.', 'That changes everything.', 'That reduces the time needed to review each invoice.'],
    analysis: ['Review added significance claim', 'This ending matches a pattern that announces significance. Consider explaining what the result shows and why; the rule does not evaluate your evidence.', 'The team met, underscoring its commitment to excellence.', 'The team met to agree on the next inspection date.'],
    abstract: ['Review abstract statement', 'This sentence matches a broad rhetorical template. Consider adding the concrete action, outcome, or evidence that gives it meaning.', 'This marks a new era.', 'The new service begins accepting applications on Monday.'],
};
export const writingSloplessConcepts = Object.freeze(Object.fromEntries(Object.entries(guidance).map(([id, [title, message]]) => [
    `formulaic.${id}`, { lens: 'formulaic', category: 'style', title, message },
])));
// Share concepts only when the advice is the same; density and phrase-level advice differ.
const sharedKinds = { 'stock-phrase': 'style.stock-phrase', wordiness: 'style.wordiness' };
export const writingSloplessKinds = Object.freeze(Object.fromEntries(Object.entries(writingSloplessRules).map(([rule, kind]) => [`slopless/${rule}`, sharedKinds[kind] || `formulaic.${kind}`])));
export function writingSloplessExample(kind, actual) {
    if (kind === 'formulaic.curly-punctuation' && ['‘', '’'].includes(actual)) return [{ label: 'Example', before: 'It’s ready.', after: 'It\'s ready.' }];
    const entry = guidance[kind?.replace(/^formulaic\./u, '')];
    return entry ? [{ label: 'Example', before: entry[2], after: entry[3] }] : [];
}

/** Native ranges are UTF-16 offsets into the projected text, never Markdown source. */
export function sloplessWritingObservations(messages, projection) {
    return messages.flatMap(message => {
        if (!Object.hasOwn(writingSloplessKinds, message.ruleId)) return [];
        const [from, to] = message.range || [];
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > projection.units.length) return [];
        // The native smart-quotes report spans all curly marks in a sentence.
        // Underline only the marks; never expose the protected quoted wording.
        let detail = '';
        let ranges = message.ruleId === 'slopless/smart-quotes'
            ? Array.from({ length: to - from }, (_, i) => from + i).filter(at => /[“”‘’]/u.test(projection.text[at])).map(at => [at, at + 1])
            : [[from, to]];
        if (message.ruleId === 'slopless/word-repetition') {
            const repeated = message.message?.match(/^Word repeated (\d+) times in one paragraph: "([\p{L}’'-]+)"\./u);
            if (!repeated || projection.units.slice(from, to).some(unit => unit.from < 0 || unit.hidden)) return [];
            const word = repeated[2].toLowerCase();
            const matches = [...projection.text.slice(from, to).matchAll(/[\p{L}’'-]+/gu)].filter(match => match[0].toLowerCase() === word);
            if (matches.length !== Number(repeated[1]) || matches.length <= 5) return [];
            const start = from + matches[0].index;
            ranges = [[start, start + matches[0][0].length]];
            detail = `“${word}” appears ${matches.length} times in this paragraph.`;
        }
        return ranges.flatMap(([start, end]) => {
            if (projection.units.slice(start, end).some(unit => unit.from < 0 || unit.hidden)) return [];
            return [{ engine: 'textlint', package: 'slopless', version: writingSloplessVersion,
                rule: message.ruleId, ruleId: message.ruleId, from: start, to: end,
                actual: projection.text.slice(start, end), replacements: [], severity: 'suggestion',
                evidenceFamily: 'unknown', message: message.message, detail, native: message }];
        });
    });
}
