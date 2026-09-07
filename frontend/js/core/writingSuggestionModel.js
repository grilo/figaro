import { writingSloplessExample } from './writingSloplessModel.js';

/** Guidance examples are explanatory; only validated fixes can edit source. */
export function writingSuggestionExplanation(finding) {
    if (finding.kind?.startsWith('formulaic.')) return `${finding.message} This is optional style advice based on a text pattern, not evidence of AI authorship. Examples illustrate an editing approach and do not rewrite your sentence.`;
    const explanations = {
        'syntax.passive': 'This pattern can describe a passive action or a state, such as “is interested” or “am tired”. Keep it when the actor is unknown, unimportant, or already clear. The example illustrates an option; it is not a diagnosis of your sentence.',
        'grammar.article': 'Article choice follows pronunciation. Names, initialisms and dialect differences can be uncertain. This is a selected article check, not a complete grammar review.',
        'grammar.spelling': 'The word is absent from the selected dictionaries. Names and specialist terms may be correct; add an intentional word to your dictionary from the editor tooltip. Contextual homophones are not checked.',
        'grammar.repeated-word': 'Two adjacent words match. Repetition can be intentional, including “had had”. Review this occurrence before removing a word; this lens does not assess repetition of ideas throughout a note.',
        'language.inclusive': 'This role, expression, or accessibility description may have a more neutral alternative. Broader matches are advice only; Apply is reserved for reviewed replacements. Preserve intended meaning, a person’s preferred title, and historical context. This check does not infer anyone’s identity or pronouns.',
        'clarity.undefined-acronym': 'No recognized expansion was found in eligible prose anywhere in the note, including after first use. Definitions in code or quotations do not count. The checker recognizes patterns; it does not know the acronym’s meaning. Accept it for this document if your audience already knows it.',
        'grammar.unmatched-pair': 'An opening mark has no recognized closing partner. Check the surrounding text manually. This check does not cover all unmatched closing marks or crossed pairs, and cannot choose where a closing mark belongs.',
        'style.terminology': 'This is one of the bundled technical names. Use its canonical spelling when you mean that product or technology. Names outside the reviewed list are not checked.',
        'lexicon.complex-word': 'This word matches a plain-language pattern. Only reviewed replacements offer Apply; other matches need manual editing. Keep the original if the distinction matters in this context. A shorter word is not automatically more precise.',
        'style.wordiness': 'This phrase matches a plain-language pattern. Only reviewed replacements offer Apply; other matches need manual editing. Compare the meaning in the sentence before applying it; the check does not evaluate your argument.',
        'style.hedging': 'Qualifiers can accurately communicate uncertainty. Keep them in scientific claims, estimates, or other statements where removing them would overstate confidence.',
        'style.hyperbole': 'Repeated marks create emphasis. This is optional tone advice; expressive or quoted writing may need that emphasis.',
        'style.stock-phrase': 'This expression matches a selected cliché or jargon rule. Familiar phrasing can be appropriate for your audience. The example is illustrative and does not rewrite your sentence.',
        'readability.long-sentence': 'Sentence length and readability formulas are rough estimates. Keep a long sentence when its structure is clear. Splitting should preserve the relationship between ideas; these checks do not measure correctness or writing quality.',
        'readability.complex-sentence': 'Several readability formulas agree that this sentence deserves review. Specialist vocabulary can raise their estimates without making the text unsuitable for its audience. These formulas do not measure correctness or writing quality.',
        'style.consistency': 'This note uses more than one reviewed form. Choose the convention you intend; neither spelling is automatically wrong.',
        'style.capitalization': 'This note uses different capitalization for a reviewed term. Preserve differences that have an intended meaning.',
        'style.diacritics': 'An accented form is available. Keep the spelling appropriate to the intended name, language, and your chosen convention.',
        'style.quotation': 'The prevailing quotation style in this note determines the suggestion; the first occurrence breaks a tie. Applying changes the quote marks together while preserving the quoted text.',
        'style.apostrophe': 'The suggestion follows the prevailing apostrophe style in this note. This checks typography, not the meaning of the quoted text.',
        'style.sentence-spacing': 'The suggestion removes extra spaces between sentences on the same source line. Authored line breaks and protected quotations are preserved.',
        'grammar.contraction': 'A selected contraction pattern may need an apostrophe. Check that you intend a contraction rather than a name or a different word.',
        'style.redundant-acronym': 'The final word repeats part of this familiar acronym. Keep it if it helps your particular audience understand the phrase.',
    };
    const explanation = explanations[finding.kind] || finding.message;
    return finding.lens === 'formulaic' ? `${explanation} This is optional style advice, not evidence of AI authorship.` : explanation;
}

export function writingSuggestionExamples(finding) {
    if (finding.kind?.startsWith('formulaic.')) return writingSloplessExample(finding.kind, finding.actual);
    if (finding.kind === 'style.sentence-spacing') return (finding.fixes || []).map(fix => ({
        label: `Suggested spacing (${fix.expected.match(/ {2,}/u)?.[0].length} spaces → 1)`,
        before: fix.expected, after: fix.replacement,
    }));
    if (finding.kind === 'syntax.passive') return [{
        label: 'Example', before: 'The report was written by Maya.', after: 'Maya wrote the report.',
    }];
    if (finding.kind === 'readability.long-sentence') return [{
        label: 'Example',
        before: 'We finished the draft, but the figures still need checking, so we will review them tomorrow.',
        after: 'We finished the draft. The figures still need checking, so we will review them tomorrow.',
    }];
    const examples = {
        'grammar.repeated-word': { before: 'We sent the the draft.', after: 'We sent the draft.' },
        'style.wordiness': { before: 'We left in order to catch the train.', after: 'We left to catch the train.' },
        'lexicon.complex-word': { before: 'We utilize this tool.', after: 'We use this tool.' },
        'style.modifier': { before: 'The file is very large.', after: 'The file contains 800 pages.' },
        'syntax.indirect-opening': { before: 'There are three tests that still fail.', after: 'Three tests still fail.' },
        'style.opening-transition': { before: 'So, the draft is ready.', after: 'The draft is ready.' },
        'style.archaism': { before: 'Please find enclosed the invoice.', after: 'The invoice is attached.' },
        'style.word-choice': { before: 'They attacked my voracity.', after: 'They questioned my honesty.' },
        'style.contradiction': { before: 'We generally always finish early.', after: 'We usually finish early.' },
        'style.disputed-term': { before: 'The label is deceptively simple.', after: 'The label looks simple but leaves out three conditions.' },
        'style.absolute-modifier': { before: 'The proof is very unique.', after: 'The proof is unique.' },
        'style.redundant-acronym': { before: 'Enter your PIN number.', after: 'Enter your PIN.' },
        'style.consistency': { before: 'The advisor met the adviser.', after: 'The adviser met the adviser.' },
        'grammar.unmatched-pair': { before: 'The draft (including the appendix is ready.', after: 'The draft (including the appendix) is ready.' },
        'clarity.undefined-acronym': { before: 'We agreed on an SLO.', after: 'We agreed on a service level objective (SLO).' },
        'readability.complex-sentence': { before: 'Implementation of the modifications necessitates additional deliberation.', after: 'We need more time to discuss the changes before making them.' },
        'style.stock-phrase': { before: 'Let’s get the ball rolling.', after: 'Let’s start the project.' },
        'style.hedging': { before: 'I would argue that the instructions need an example.', after: 'The instructions need an example.' },
        'style.hyperbole': { before: 'The draft is ready!!', after: 'The draft is ready!' },
        'language.inclusive': { before: 'Obviously, you can change this setting.', after: 'You can change this setting.' },
    };
    if (examples[finding.kind] && !finding.fixes?.length) return [{ label: 'Example', ...examples[finding.kind] }];
    return (finding.fixes || []).map(fix => ({ label: 'Suggested wording', before: fix.expected, after: fix.replacement }));
}
