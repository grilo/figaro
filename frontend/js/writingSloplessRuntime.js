// Eager package imports only: the CLI and its filesystem/configuration loaders are not bundled.
import emDashes from 'slopless/rules/orthography/em-dashes';
import smartQuotes from 'slopless/rules/orthography/smart-quotes';
import boilerplateFraming from 'slopless/rules/syntactic-patterns/lead-ins/boilerplate-framing';
import genericSignposting from 'slopless/rules/syntactic-patterns/lead-ins/generic-signposting';
import negationReframe from 'slopless/rules/syntactic-patterns/contrast/negation-reframe';
import contrastiveAphorism from 'slopless/rules/syntactic-patterns/contrast/contrastive-aphorism';
import blameReframe from 'slopless/rules/syntactic-patterns/contrast/blame-reframe';
import universalizingClaims from 'slopless/rules/syntactic-patterns/generalization/universalizing-claims';
import authorityPadding from 'slopless/rules/syntactic-patterns/authority/authority-padding';
import boilerplateConclusion from 'slopless/rules/syntactic-patterns/closers/boilerplate-conclusion';
import summativeCloser from 'slopless/rules/syntactic-patterns/closers/summative-closer';
import formulaicChallenges from 'slopless/rules/syntactic-patterns/closers/formulaic-challenges';
import lessonFraming from 'slopless/rules/syntactic-patterns/lead-ins/lesson-framing';
import observerGuidance from 'slopless/rules/syntactic-patterns/lead-ins/observer-guidance';
import responseWrapper from 'slopless/rules/syntactic-patterns/llm-artifacts/response-wrapper';
import llmDisclaimer from 'slopless/rules/phrases/llm-disclaimer';
import formalTransitionDensity from 'slopless/rules/syntactic-patterns/lead-ins/formal-transition-density';
import repeatedSentenceStarts from 'slopless/rules/syntactic-patterns/repetition/repeated-sentence-starts';
import emptyEmphasis from 'slopless/rules/syntactic-patterns/repetition/empty-emphasis';
import superficialAnalysis from 'slopless/rules/semantic-thinness/superficial-analysis';
import semanticThinness from 'slopless/rules/semantic-thinness/semantic-thinness';

import cliches from 'slopless/rules/phrases/cliches';
import corporateSpeak from 'slopless/rules/phrases/corporate-speak';
import wordiness from 'slopless/rules/phrases/wordiness';
import simplicity from 'slopless/rules/words/simplicity';
import redundancy from 'slopless/rules/phrases/redundancy';
import exclamationDensity from 'slopless/rules/orthography/exclamation-density';
import wordRepetition from 'slopless/rules/metrics/word-repetition';
import hedgeStacking from 'slopless/rules/words/hedge-stacking';
import softeningLanguage from 'slopless/rules/syntactic-patterns/generalization/softening-language';

const rules = { 'cliches': cliches, 'corporate-speak': corporateSpeak, 'wordiness': wordiness, 'simplicity': simplicity, 'redundancy': redundancy, 'exclamation-density': exclamationDensity, 'word-repetition': wordRepetition, 'hedge-stacking': hedgeStacking, 'softening-language': softeningLanguage, 'em-dashes': emDashes, 'smart-quotes': smartQuotes,
    'boilerplate-framing': boilerplateFraming, 'generic-signposting': genericSignposting,
    'negation-reframe': negationReframe, 'contrastive-aphorism': contrastiveAphorism, 'blame-reframe': blameReframe,
    'universalizing-claims': universalizingClaims, 'authority-padding': authorityPadding,
    'boilerplate-conclusion': boilerplateConclusion, 'summative-closer': summativeCloser, 'formulaic-challenges': formulaicChallenges,
    'lesson-framing': lessonFraming, 'observer-guidance': observerGuidance, 'response-wrapper': responseWrapper,
    'llm-disclaimer': llmDisclaimer, 'formal-transition-density': formalTransitionDensity,
    'repeated-sentence-starts': repeatedSentenceStarts, 'empty-emphasis': emptyEmphasis,
    'superficial-analysis': superficialAnalysis, 'semantic-thinness': semanticThinness };
export const writingSloplessRuntimeRules = Object.entries(rules).map(([name, rule]) => ({ ruleId: `slopless/${name}`, rule }));
