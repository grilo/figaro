import releaseNotes from '../../../scripts/releaseNotes.cjs';

const { extractReleaseNotes, keepAChangelogCategories } = releaseNotes;

describe('curated GitHub release notes', () => {
    const changelog = [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '_No changes yet._',
        '',
        '## [1.14.0] - 2030-04-05',
        '',
        '### Added',
        '',
        '- Keyboard navigation.',
        '',
        '### Changed',
        '',
        '- Clearer release notes.',
        '',
        '### Fixed',
        '',
        '- Reliable export.',
        '',
        '## 1.13.1 - 2030-03-01',
        '',
        '### Fixed',
        '',
        '- Previous fix.',
        '',
        '[Unreleased]: https://github.com/grilo/figaro/compare/v1.14.0...HEAD',
        '[1.14.0]: https://github.com/grilo/figaro/compare/v1.13.1...v1.14.0',
    ].join('\n');

    test('extracts only the requested Added, Changed, and Fixed release body', () => {
        const notes = extractReleaseNotes(changelog, 'v1.14.0');

        expect(notes).toContain('### Added\n\n- Keyboard navigation.');
        expect(notes).toContain('### Changed\n\n- Clearer release notes.');
        expect(notes).toContain('### Fixed\n\n- Reliable export.');
        expect(notes).not.toContain('Previous fix');
        expect(notes).not.toContain('[Unreleased]:');
    });

    test('supports every standard Keep a Changelog category in canonical order', () => {
        expect(keepAChangelogCategories).toEqual([
            'Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security',
        ]);
    });

    test('rejects missing releases, empty categories, and nonstandard category order', () => {
        expect(() => extractReleaseNotes(changelog, 'v9.9.9')).toThrow('no dated release section');
        expect(() => extractReleaseNotes(changelog.replace('- Reliable export.', ''), '1.14.0'))
            .toThrow('category "Fixed" has no release-note entries');
        expect(() => extractReleaseNotes(changelog.replace('### Added', '### Security'), '1.14.0'))
            .toThrow('duplicated or out of Keep a Changelog order');
    });
});
