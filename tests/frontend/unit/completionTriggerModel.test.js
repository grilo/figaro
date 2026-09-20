import { advanceCompletionTriggers } from '../../../frontend/js/core/completionTriggerModel.js';
import { headingLinkCompletionMatch } from '../../../frontend/js/linkCompletions.js';
import { isHashtagCompletionTrigger } from '../../../frontend/js/core/taskDueDateCompletionModel.js';

test('streamed completion context agrees with the source matchers at every prefix', () => {
    const samples = ['See [label](#target)', '![image](#no)', ' #tag-name then #next',
        '[outer [inner](#one[#two', '[x](#word](#again', 'First [note](#ab\n #next',
        '[x](#emoji😀', '[x](#with\\escape', '![[label](#', '# Heading'];
    let seed = 731;
    const alphabet = 'ab12_ -\t[]()#!\\\n';
    for (let example = 0; example < 100; example++) {
        let sample = '';
        for (let i = 0; i < 120; i++) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            sample += alphabet[seed % alphabet.length];
        }
        samples.push(sample);
    }
    for (const sample of samples) {
        let context, prefix = '';
        for (const character of sample) {
            prefix += character;
            context = advanceCompletionTriggers(character, context);
            const line = prefix.slice(prefix.lastIndexOf('\n') + 1);
            expect(context.heading).toBe(Boolean(headingLinkCompletionMatch(line)));
            expect(context.hashtag).toBe(isHashtagCompletionTrigger(line));
        }
        expect(context).toEqual(advanceCompletionTriggers(sample));
    }
});
