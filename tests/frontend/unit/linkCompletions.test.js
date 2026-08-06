import {
    headingLinkCompletionMatch,
    markdownHeadingSlug,
    markdownHeadingTargets,
    linkedNoteCompletionInsertion,
    noteLinkCompletion,
    noteLinkCompletionMatch,
    planLinkedNoteCompletion,
    shouldOfferLinkedNoteCreation,
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

    test('plans an explicit same-folder note creation and its configured link syntax', () => {
        const markdownPlan = planLinkedNoteCompletion({
            label: 'A link',
            currentPath: 'notes/current.md',
            style: 'markdown',
        });
        expect(markdownPlan).toEqual({
            label: 'A link',
            fileName: 'A link.md',
            parentDirectory: 'notes',
            path: 'notes/A link.md',
            content: '# A link\n\n',
            style: 'markdown',
        });
        expect(linkedNoteCompletionInsertion(markdownPlan)).toBe('[A link](notes/A%20link.md) ');

        const wikiPlan = planLinkedNoteCompletion({ label: 'A link.md', style: 'wikilink' });
        expect(linkedNoteCompletionInsertion(wikiPlan)).toBe('[[A link.md|A link]] ');
    });

    test('offers creation only for a valid label without an exact same-folder note', () => {
        const plan = planLinkedNoteCompletion({ label: 'A link', currentPath: 'notes/current.md' });
        expect(shouldOfferLinkedNoteCreation(plan, [{ path: 'archive/A link.md' }])).toBe(true);
        expect(shouldOfferLinkedNoteCreation(plan, [{ path: 'notes/a LINK.md' }])).toBe(false);
        expect(planLinkedNoteCompletion({ label: '../escape', currentPath: 'notes/current.md' })).toBeNull();
        expect(planLinkedNoteCompletion({ label: '   ', currentPath: 'notes/current.md' })).toBeNull();
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
