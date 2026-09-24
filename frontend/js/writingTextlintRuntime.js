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
const sloplessOptions = { ...options, rules: writingSloplessRuntimeRules };
// Exercise rule registration and parser initialization before worker readiness.
export const writingTextlintReady = Promise.all([options, sloplessOptions].map(value => kernel.lintText('', value))).then(() => undefined);
export async function analyzeWritingTextlint(projection) {
    await writingTextlintReady;
    const input = writingTextlintProjection(projection);
    writingSloplessCache.clear();
    try {
        const results = await Promise.all([
            writingTextlintNeeded(input) ? kernel.lintText(input.text, options).then(result => textlintWritingObservations(result.messages, input)) : [],
            /\p{L}/u.test(input.text) ? kernel.lintText(input.text, sloplessOptions).then(result => sloplessWritingObservations(result.messages, input)) : [],
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
    return {
        async analyze(projection, checkpoint) {
            await writingTextlintReady;
            const input = writingTextlintProjection(projection);
            const messages = [[], []];
            const chunks = writingParagraphChunks(input.text);
            const results = await prose.checkMany(chunks, checkpoint, (values, chunk) => values.map(value => localTextlintMessages(value, chunk)));
            for (let at = 0; at < chunks.length; at++) {
                const chunk = chunks[at], values = results[at];
                for (let i = 0; i < values.length; i++) messages[i].push(...values[i].map(message => offsetTextlintMessage(message, chunk)));
            }
            return [textlintWritingObservations(messages[0], input), sloplessWritingObservations(messages[1], input)].flat();
        },
        stats: () => ({ prose: prose.stats() }),
    };
}
