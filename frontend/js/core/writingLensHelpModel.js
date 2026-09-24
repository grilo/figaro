import { writingLensGroups, writingLensGroupState, writingLensDisabledReason, writingLensSupportsLanguage } from './writingLensesModel.js';

// Editorial illustrations, not replacement candidates for the current note.
const help = {
    proofreading: {
        coverage: 'Checks dictionary spelling, adjacent repeated words, reviewed term and capitalization conventions, and selected agreement, verb, noun, homophone, phrase, word-boundary, number, capitalization, and punctuation patterns.',
        limits: 'Grammar and homophone checks use selected context patterns. Complex subjects, ambiguous meanings, and dialect differences need your judgment. Spelling Apply to all is limited to reviewed corrections.',
        examples: [
            { label: 'Spelling', before: 'teh', after: 'the' },
            { label: 'Verb agreement', before: 'She go to school.', after: 'She goes to school.' },
            { label: 'Homophone', before: 'Your welcome.', after: 'You’re welcome.' },
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
    directness: {
        coverage: 'Reviews possible passive constructions, indirect openings, modifiers, hedging, and wording that assumes readers find a task easy or already know the answer.',
        limits: 'Passive voice can be appropriate when the actor is unknown or unimportant. Qualifiers can express real uncertainty; removing them can overstate a claim. Words such as “simple” and “just” are reviewed only in instructions or sentences addressed to the reader; describing something as simple is not flagged. Examples require your judgment.',
        examples: [
            { label: 'Name the actor', before: 'The report was written by Maya.', after: 'Maya wrote the report.' },
            { label: 'Direct opening', before: 'There are three tests that still fail.', after: 'Three tests still fail.' },
            { label: 'Review hedging', before: 'I would argue that the instructions need an example.', after: 'The instructions need an example.' },
            { label: 'Reader assumption', before: 'Simply run the installer.', after: 'Run the installer.' },
        ],
    },
    'inclusive-language': {
        coverage: 'Reviews generic role names, exclusionary expressions, and accessibility descriptions, with alternatives where appropriate. Wording that assumes a task is easy belongs to Directness.',
        limits: 'Preserve intended meaning, historical context, and a person’s preferred terms. These checks do not infer anyone’s identity or pronouns. Broader matches are advice only.',
        examples: [
            { label: 'Generic role', before: 'The chairman spoke.', after: 'The chairperson spoke.' },
            { label: 'Exclusionary term', before: 'Add the domain to the whitelist.', after: 'Add the domain to the allowlist.' },
            { label: 'Accessibility description', before: 'She is wheelchair-bound.', after: 'She uses a wheelchair.' },
        ],
    },
    'formulaic-writing': {
        coverage: 'Reviews stock framing, rhetorical patterns, wordiness, repetition, stacked qualifications, emphatic punctuation, unspaced em dashes, and quotation marks or apostrophes that differ from the note’s prevailing style.',
        limits: 'These are optional style and typography preferences, not evidence of AI authorship. They can be intentional. Quotation and apostrophe style can be applied to match the note; other formulaic advice requires manual editing, and the examples do not rewrite your text.',
        examples: [
            { label: 'Stock framing', before: 'It is worth noting that the draft is ready.', after: 'The draft is ready.' },
            { label: 'Emphatic punctuation', before: 'The draft is ready!!', after: 'The draft is ready!' },
            { label: 'Unspaced em dash', before: 'The draft is ready—we can send it.', after: 'The draft is ready — we can send it.' },
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
