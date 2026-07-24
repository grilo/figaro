import {
    headingLinkCompletionMatch,
    markdownHeadingSlug,
    markdownHeadingTargets,
    noteLinkCompletion,
    noteLinkCompletionMatch,
} from '../frontend/js/linkCompletions.js';

describe('note link autocomplete syntax', () => {
    test('inserts explicit vault-relative conventional wikilinks', () => {
        expect(noteLinkCompletion('wikilink', {
            name: 'Welcome.md',
            path: 'notes/Welcome.md',
        })).toBe('[[notes/Welcome.md|Welcome]] ');
    });

    test('keeps Markdown links encoded when Markdown is preferred', () => {
        expect(noteLinkCompletion('markdown', {
            name: 'Guide Note.md',
            path: 'docs/Guide Note.md',
        })).toBe('[Guide Note](docs/Guide%20Note.md) ');
    });

	test('falls back to a safe Markdown link for names conventional wikilinks cannot represent', () => {
		expect(noteLinkCompletion('wikilink', {
			name: 'A] tricky (note).md',
			path: 'docs/A] tricky (note).md',
		})).toBe('[A\\] tricky (note)](docs/A%5D%20tricky%20%28note%29.md) ');
	});

    test('matches one or two opening brackets but not image syntax', () => {
        expect(noteLinkCompletionMatch('See [Wel')).toEqual({ fromOffset: 4, prefix: 'Wel' });
        expect(noteLinkCompletionMatch('See [[Wel')).toEqual({ fromOffset: 4, prefix: 'Wel' });
        expect(noteLinkCompletionMatch('See ![Wel')).toBeNull();
    });

    test('offers stable in-document heading fragments without frontmatter or fenced examples', () => {
        const source = [
            '---',
            'title: Ignore this heading-like metadata',
            '---',
            '# Start here',
            '## Start here',
            'A Setext heading',
            '---',
            '```markdown',
            '# Example only',
            '```',
        ].join('\n');

        expect(markdownHeadingSlug('Café Notes')).toBe('cafe-notes');
        expect(markdownHeadingTargets(source)).toEqual([
            { label: 'Start here', slug: 'start-here' },
            { label: 'Start here', slug: 'start-here-2' },
            { label: 'A Setext heading', slug: 'a-setext-heading' },
        ]);
    });

    test('matches only an unfinished Markdown-link heading fragment', () => {
        expect(headingLinkCompletionMatch('See [the start](#sta')).toEqual({ fromOffset: 16, prefix: 'sta' });
        expect(headingLinkCompletionMatch('![image](#sta')).toBeNull();
        expect(headingLinkCompletionMatch('See [the start](other.md')).toBeNull();
    });
});
