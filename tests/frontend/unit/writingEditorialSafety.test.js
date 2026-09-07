import { analyzeWriting } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings } from '../../../frontend/js/core/writingAnalysisModel.js';

async function findings(source, lens, language = 'en-US') {
    const result = resolveWritingFindings({ source, ...await analyzeWriting(source), preferences: { lenses: [lens], language } });
    return result.groups.flatMap(group => group.findings);
}

test.each(['en-US', 'en-GB'])('article policy keeps regional pronunciation choices with the author in %s', async language => {
    for (const source of ['A herb grows here.', 'An herb grows here.', 'A historic event happened.', 'An historic event happened.']) {
        expect(await findings(source, 'grammar', language)).toEqual([]);
    }
});

test.each([
    'Maya is an engineer. She works here.', 'He is a deaf artist.',
    'She describes herself as autistic. They are disabled activists.',
    'The Black Sea borders Turkey. The White House issued a statement.',
])('Inclusive language preserves personal references and identity: %s', async source => {
    expect(await findings(source, 'inclusive')).toEqual([]);
});

test('Inclusive language exposes only reviewed grammatical role alternatives', async () => {
    const [finding] = await findings('The chairman spoke.', 'inclusive');
    expect(finding.fixes.map(fix => fix.replacement)).toEqual(['chair', 'chairperson']);
    for (const fix of finding.fixes) expect(`The ${fix.replacement} spoke.`).toMatch(/^The chair(?:person)? spoke\.$/);
    const [advice] = await findings('Obviously, you can change it.', 'inclusive');
    expect(advice.fixes).toEqual([]);
});

test.each(['A unicorn appeared.', 'A\nunicorn appeared.', 'A uniform is ready.', 'A European visitor arrived.',
    'An umbrella helps.', 'An honest answer helps.', 'An hour passed.', 'An FBI agent called.',
    'A herb grows here.', 'An herb grows here.', 'A historic event happened.', 'An historic event happened.',
    'A URL is useful.', 'An URL is useful.', 'Use a “safe” example.'])('article safety keeps correct or uncertain pronunciation unchanged: %s', async source => {
    expect(await findings(source, 'grammar')).toEqual([]);
});

test.each([['An unicorn appeared.', 'A unicorn appeared.'], ['An European visitor arrived.', 'A European visitor arrived.'],
    ['A elephant arrived.', 'An elephant arrived.'], ['A hour passed.', 'An hour passed.'],
    ['An\nunicorn appeared.', 'A\nunicorn appeared.'], ['A FBI agent called.', 'An FBI agent called.']])('article safety corrects a verified pronunciation: %s', async (source, expected) => {
    const result = await findings(source, 'grammar');
    expect(result).toHaveLength(1);
    const fix = result[0].fixes[0];
    expect(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).toBe(expected);
});
