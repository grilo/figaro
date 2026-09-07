import { writingLensGroups, writingLensGroupState, writingLensDisabledReason, writingLensSupportsLanguage } from './writingLensesModel.js';

// Editorial illustrations, not replacement candidates for the current note.
const help = {
    proofreading: {
        coverage: 'Checks dictionary spelling, adjacent repeated words, reviewed term and quotation conventions, and selected grammar and punctuation patterns.',
        limits: 'This is not a complete grammar check: subject–verb agreement and contextual homophones such as “their/there” are not checked. Names and dictionary alternatives need your judgment; spelling Apply to all is limited to reviewed corrections.',
        examples: [
            { label: 'Spelling', before: 'teh', after: 'the' },
            { label: 'Repeated word', before: 'the the draft', after: 'the draft' },
            { label: 'Article', before: 'a apple', after: 'an apple' },
            { label: 'Technical name', before: 'Javascript', after: 'JavaScript' },
        ],
    },
    clarity: {
        coverage: 'Reviews complex words, wordy phrases, jargon, acronym explanations, and long or complex sentences.',
        limits: 'Simpler wording must preserve meaning. Length advice starts above 30 words; readability estimates do not measure writing quality. Acronym definitions can appear anywhere in eligible prose, before or after the acronym, including plural forms. Recognition uses initials and a limited “of” word order; it does not know their meaning.',
        examples: [
            { label: 'Simpler word', before: 'We utilize this tool.', after: 'We use this tool.' },
            { label: 'Shorter phrase', before: 'We left in order to catch the train.', after: 'We left to catch the train.' },
            { label: 'Explain an acronym', before: 'We agreed on an SLO.', after: 'We agreed on a service level objective (SLO).' },
            { label: 'Split an idea', before: 'We finished the draft, but the figures still need checking, so we will review them tomorrow.', after: 'We finished the draft. The figures still need checking, so we will review them tomorrow.' },
        ],
    },
    direct: {
        coverage: 'Reviews possible passive constructions, indirect openings, modifiers, hedging, and emphatic punctuation.',
        limits: 'Passive voice can be appropriate when the actor is unknown or unimportant. Qualifiers can express real uncertainty; removing them can overstate a claim. Examples require your judgment.',
        examples: [
            { label: 'Name the actor', before: 'The report was written by Maya.', after: 'Maya wrote the report.' },
            { label: 'Direct opening', before: 'There are three tests that still fail.', after: 'Three tests still fail.' },
            { label: 'Review hedging', before: 'I would argue that the instructions need an example.', after: 'The instructions need an example.' },
            { label: 'Review emphasis', before: 'The draft is ready!!', after: 'The draft is ready!' },
        ],
    },
    inclusive: {
        coverage: 'Reviews generic role names, exclusionary expressions, and accessibility descriptions, with alternatives where appropriate.',
        limits: 'Preserve intended meaning, historical context, and a person’s preferred terms. These checks do not infer anyone’s identity or pronouns. Broader matches are advice only.',
        examples: [
            { label: 'Generic role', before: 'The chairman spoke.', after: 'The chairperson spoke.' },
            { label: 'Avoid assumptions', before: 'Obviously, you can change this setting.', after: 'You can change this setting.' },
            { label: 'Accessibility description', before: 'She is wheelchair-bound.', after: 'She uses a wheelchair.' },
        ],
    },
    formulaic: {
        coverage: 'Reviews stock framing, rhetorical patterns, wordiness, repetition, stacked qualifications, unspaced em dashes, and curly quotes or apostrophes.',
        limits: 'These are optional style and typography preferences, not evidence of AI authorship. They can be intentional. Formulaic advice requires manual editing; the examples do not rewrite your text.',
        examples: [
            { label: 'Stock framing', before: 'It is worth noting that the draft is ready.', after: 'The draft is ready.' },
            { label: 'Wordiness', before: 'We left in order to catch the train.', after: 'We left to catch the train.' },
            { label: 'Unspaced em dash', before: 'The draft is ready—we can send it.', after: 'The draft is ready; we can send it.' },
            { label: 'Curly apostrophe', before: 'We’re ready.', after: 'We\'re ready.' },
        ],
    },
};

export function writingLensHelp(lens, { preferences, status, applying = false }) {
    const group = writingLensGroups.find(item => item.id === lens);
    const state = writingLensGroupState(lens, preferences);
    const language = preferences.language;
    const available = group.checks.some(check => writingLensSupportsLanguage(check, language));
    const spanish = lens === 'proofreading' && language === 'es';
    return {
        title: `About ${group.label}`,
        coverage: spanish ? 'Checks words against the Spanish dictionary. The other Proofreading checks currently support English.' : help[lens].coverage,
        limits: spanish ? 'Names and specialist terms may be correct. This checks spelling only, not Spanish grammar or words used in the wrong context.' : help[lens].limits,
        detail: state.detail,
        reason: writingLensDisabledReason(lens, { language, status, applying }),
        exampleNote: state.partial ? 'Illustrative examples of the full lens, including checks not yet selected.' : 'Illustrative examples; review changes in context.',
        examples: !available ? [] : spanish ? [
            { label: 'Spelling', before: 'holaa', after: 'hola' },
            { label: 'Spelling', before: 'grasias', after: 'gracias' },
            { label: 'Spelling', before: 'escrivir', after: 'escribir' },
        ] : help[lens].examples,
    };
}
