import { analyzeWriting, prepareWritingSource } from '../../../frontend/vendored/writing/runtime.js';
import { resolveWritingFindings } from '../../../frontend/js/core/writingAnalysisModel.js';

const preferences = { lenses: ['plain', 'direct', 'grammar'], language: 'en-US' };
const visible = result => result.groups.flatMap(group => group.findings);
function observation(projection, actual, rule, replacements = []) {
    const from = projection.text.indexOf(actual);
    expect(from).toBeGreaterThanOrEqual(0);
    return { engine: 'vale', rule, actual, from, to: from + actual.length, replacements };
}
function review(source, actual, rule) {
    const projection = prepareWritingSource(source);
    return resolveWritingFindings({ source, projection, observations: [observation(projection, actual, rule)], preferences });
}

test.each([
    ['The battery was replaced at 16:20.', 'was replaced'],
    ['The instruments near the bridge have been checked twice today.', 'been checked'],
    ['The labels on that copy were checked last week and remain correct.', 'were checked'],
    ['The seedlings were measured at noon.', 'were measured'],
    ['The door will be closed tomorrow.', 'be closed'],
    ['The spare battery was inspected by noon.', 'was inspected'],
    ['The grass is flattened beneath the trees.', 'is flattened'],
    ['The gate had been repaired, and the tools were clean.', 'been repaired'],
    ['The cable cannot be thrown away.', 'be thrown'],
    ['The afternoon is reserved for questions.', 'is reserved'],
    ['Its address is printed on the welcome card.', 'is printed'],
    ['The full method is described in the field guide.', 'is described'],
    ['You will be welcomed at either entrance.', 'be welcomed'],
    ['Visitors will be given a map at the desk.', 'be given'],
    ['Their going to be thanked surprised the helpers.', 'be thanked'],
    ['Their going home was expected.', 'was expected'],
    ['Their going to be interviewed was unexpected.', 'be interviewed'],
    ['Your going to have been selected surprised the group.', 'been selected'],
    ['Their not going to be served immediately seemed reasonable.', 'be served'],
    ['Their going to have been told already was my first assumption.', 'been told'],
    ['Accepts two parameters and is expected to return a value.', 'is expected'],
    ['The maximum time in milliseconds that the operation is allowed to run.', 'is allowed'],
    ['Installation is done using the `npm install` command.', 'is done'],
    ['The file to serve will be determined by combining the path with the root directory.', 'be determined'],
    ['Set how "dotfiles" are treated when encountered.', 'are treated'],
    ['If `root` is specified, only the dotfiles above the root are checked.', 'is specified'],
    ['The first that exists will be served.', 'be served'],
    ['Asynchronous iterables (different from synchronous iterables that return a promise resolving to an item) can be used when waiting for a process.', 'be used'],
    ['Calls to `mapper` will be limited so the queue can drain.', 'be limited'],
])('descriptive passive context agrees across native and participle-only spans: %s', (source, actual) => {
    for (const [match, rule] of [[actual, 'write-good.Passive'], [actual, 'Microsoft.Passive'], [actual.split(' ').at(-1), 'retext-passive']]) {
        const result = review(source, match, rule);
        expect(visible(result)).toEqual([]);
        expect(result.evidence[0].suppressed).toBeTruthy();
    }
});

test.each([
    ['The decision was made by the board.', 'was made'],
    ['The request was rejected by the manager.', 'was rejected'],
    ['The battery was replaced at noon by the engineer.', 'was replaced'],
    ['The labels were checked twice today by a volunteer.', 'were checked'],
    ['The gate had been repaired by the owner.', 'been repaired'],
    ['The method is described in the guide by its author.', 'is described'],
    ['The report was written yesterday.', 'was written'],
    ['The decision had been approved.', 'been approved'],
    ['The files were checked by `validateInput`.', 'were checked'],
    ['Their going to be told to leave.', 'be told'],
    ['Their going to be thanked. The helpers were surprised.', 'be thanked'],
    ['Their going to be thanked\n\nsurprised the helpers.', 'be thanked'],
    ['The battery was replaced. At noon the engineer arrived.', 'was replaced'],
    ['The battery was replaced `at noon`.', 'was replaced'],
    ['The report was checked by the deadline reviewer.', 'was checked'],
    ['He accepts two parameters and is expected to return tomorrow.', 'is expected'],
])('actor, sentence, protected-text and unsupported-context boundaries retain advice: %s', (source, actual) => {
    const result = review(source, actual, 'Microsoft.Passive');
    expect(result.evidence[0].suppressed).toBe('');
    // Context keeps the advice; a lone passive is shown only when it names its actor.
    if (/\bby\b/u.test(source)) expect(visible(result)).toHaveLength(1);
    else expect(result.findings[0].suppressed).toBe('Single passive without a named actor');
});

test.each([
    'There are two large jugs on the shelf.',
    'There are three bottles beside the door.',
    'There is one spare chair in the room.',
    'There is no reason to change the threshold yet.',
    'There is no need to repeat the measurement.',
    'Make changes while there is still time to do so.',
    'Calls are limited so that there is never too much backpressure.',
    'There is enough space for another table.',
])('existential wording carries concrete location, quantity or availability: %s', source => {
    const actual = source.match(/there (?:is|are)/iu)[0];
    for (const rule of ['write-good.ThereIs', 'write-good.TooWordy', 'retext-simplify']) {
        const result = review(source, actual, rule);
        expect(visible(result)).toEqual([]);
        expect(result.evidence[0].kind).toBe('syntax.indirect-opening');
        expect(result.evidence[0].suppressed).toBeTruthy();
    }
});

test.each([
    'There are several ways in which we can improve this.',
    'There is a need to review the totals.',
    'There is an opportunity to make progress.',
    'There are things in the report that need attention.',
    'There are two ways in which this can work.',
    'There are `two jugs on the shelf`.',
    'There is\n\nstill time to do so.',
])('weak introductions and hidden or disconnected complements remain reviewable: %s', source => {
    const actual = source.match(/there (?:is|are)/iu)[0];
    expect(visible(review(source, actual, 'write-good.ThereIs'))).toHaveLength(1);
});

test('descriptive style suppression preserves independent overlapping grammar corrections', async () => {
    const source = 'The instruments near the bridge has been checked twice today. Your going to be welcomed at either entrance. There is no reason of leaving.';
    const data = await analyzeWriting(source), { projection } = data;
    const observations = [...data.observations,
        observation(projection, 'been checked', 'Microsoft.Passive'),
        observation(projection, 'be welcomed', 'write-good.Passive'),
        observation(projection, 'There is', 'write-good.ThereIs'),
        observation(projection, 'has', 'FigaroGrammar.NounSubjectAgreement', ['have']),
        observation(projection, 'Your', 'FigaroGrammar.YourPredicateAdjective', ["You're"]),
        observation(projection, 'reason of', 'FigaroGrammar.ReasonForDoing', ['reason for']),
    ];
    const findings = visible(resolveWritingFindings({ source, ...data, observations, preferences }));
    expect(findings.filter(f => ['syntax.passive', 'syntax.indirect-opening'].includes(f.kind))).toEqual([]);
    expect(findings.flatMap(f => f.fixes).map(f => [f.expected, f.replacement])).toEqual(expect.arrayContaining([
        ['has', 'have'], ['Your', "You're"], ['reason of', 'reason for'],
    ]));
});

test('real package output retains useful introductions and actor advice next to factual descriptions', async () => {
    const source = 'The battery was replaced at 16:20. There are two large jugs on the shelf. There is a need to review the totals. The decision was made by the board.';
    const result = resolveWritingFindings({ source, ...await analyzeWriting(source), preferences });
    expect(visible(result).filter(f => ['syntax.passive', 'syntax.indirect-opening'].includes(f.kind)).map(f => f.actual))
        .toEqual(['There is', 'made']);
});
