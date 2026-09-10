import { createWritingParagraphChecks } from './usecases/writingParagraphChecks.js';
import { localTextlintMessages, offsetTextlintMessage, writingParagraphChunks } from './core/writingIncrementalModel.js';
import { localParagraphRule } from './writingParagraphRule.js';
import { writingSloplessCache } from './writingSloplessCache.js';
// Concrete package adapter: the kernel executes the actual pinned rule modules.
import { TextlintKernel } from '@textlint/kernel';
import textPluginModule from '@textlint/textlint-plugin-text';
import unmatchedPair from '@textlint-rule/textlint-rule-no-unmatched-pair';
import terminology from 'textlint-rule-terminology';
import { writingTerminology, writingTextlintProjection, writingTextlintNeeded, textlintWritingObservations } from './core/writingTextlintModel.js';
import { writingSloplessRuntimeRules } from './writingSloplessRuntime.js';
import { sloplessWritingObservations } from './core/writingSloplessModel.js';

const kernel = new TextlintKernel();
// The maintained parser publishes its default plugin through CommonJS.
const textPlugin = textPluginModule.default ?? textPluginModule;
const options = {
    ext: '.txt', plugins: [{ pluginId: 'text', plugin: textPlugin }],
    rules: [
        { ruleId: '@textlint-rule/no-unmatched-pair', rule: localParagraphRule(unmatchedPair) },
        { ruleId: 'textlint-rule-terminology', rule: terminology, options: { defaultTerms: false, terms: writingTerminology } },
    ],
};
const sloplessOptions = { ...options, rules: writingSloplessRuntimeRules.filter(item => item.ruleId !== 'slopless/smart-quotes') };
const quoteOptions = { ...options, rules: writingSloplessRuntimeRules.filter(item => item.ruleId === 'slopless/smart-quotes') };
// Exercise rule registration and parser initialization before worker readiness.
export const writingTextlintReady = Promise.all([options, sloplessOptions, quoteOptions].map(value => kernel.lintText('', value))).then(() => undefined);
export async function analyzeWritingTextlint(projection) {
    await writingTextlintReady;
    const input = writingTextlintProjection(projection);
    const typography = writingTextlintProjection(projection.typography || projection);
    writingSloplessCache.clear();
    try {
        const results = await Promise.all([
            writingTextlintNeeded(input) ? kernel.lintText(input.text, options).then(result => textlintWritingObservations(result.messages, input)) : [],
            /\p{L}/u.test(input.text) ? kernel.lintText(input.text, sloplessOptions).then(result => sloplessWritingObservations(result.messages, input)) : [],
            /[“”‘’]/u.test(typography.text) ? kernel.lintText(typography.text, quoteOptions).then(result => sloplessWritingObservations(result.messages, typography)) : [],
        ]);
        return results.flat();
    } finally { writingSloplessCache.clear(); }
}

/** All pinned rules in these packs operate on sentences, strings, or paragraphs.
 * Keep this boundary covered by full-scan equivalence when upgrading packages.
 */
export function createIncrementalWritingTextlint() {
    const prose = createWritingParagraphChecks({ analyze: async text => {
        writingSloplessCache.clear();
        try {
            return await Promise.all([
                writingTextlintNeeded({ text }) ? kernel.lintText(text, options).then(value => value.messages) : [],
                /\p{L}/u.test(text) ? kernel.lintText(text, sloplessOptions).then(value => value.messages) : [],
            ]);
        } finally { writingSloplessCache.clear(); }
    } });
    const quotes = createWritingParagraphChecks({ analyze: text => /[“”‘’]/u.test(text)
        ? kernel.lintText(text, quoteOptions).then(value => value.messages) : [] });
    return {
        async analyze(projection, checkpoint) {
            await writingTextlintReady;
            const input = writingTextlintProjection(projection);
            const typography = writingTextlintProjection(projection.typography || projection);
            const messages = [[], [], []];
            const chunks = writingParagraphChunks(input.text);
            const results = await prose.checkMany(chunks, checkpoint, (values, chunk) => values.map(value => localTextlintMessages(value, chunk)));
            for (let at = 0; at < chunks.length; at++) {
                const chunk = chunks[at], values = results[at];
                for (let i = 0; i < values.length; i++) messages[i].push(...values[i].map(message => offsetTextlintMessage(message, chunk)));
            }
            const quoteChunks = writingParagraphChunks(typography.text);
            const quoteResults = await quotes.checkMany(quoteChunks, checkpoint, localTextlintMessages);
            for (let at = 0; at < quoteChunks.length; at++) {
                const chunk = quoteChunks[at], values = quoteResults[at];
                messages[2].push(...values.map(message => offsetTextlintMessage(message, chunk)));
            }
            return [textlintWritingObservations(messages[0], input), sloplessWritingObservations(messages[1], input), sloplessWritingObservations(messages[2], typography)].flat();
        },
        stats: () => ({ prose: prose.stats(), quotes: quotes.stats() }),
    };
}
