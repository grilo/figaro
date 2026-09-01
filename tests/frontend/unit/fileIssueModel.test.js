import {
    fileIssuesEqual,
    fileIssueIndex,
    fileIssueSummary,
    fileIssueTreeDescription,
    groupedFileIssues,
    normalizeFileIssues,
    removeRuntimeFileIssue,
    replaceVaultFileIssues,
    upsertRuntimeFileIssue,
} from '../frontend/js/core/fileIssueModel.js';

const warning = {
    path: 'Archive/large.md',
    code: 'too_large',
    severity: 'warning',
    title: 'Too large for Figaro',
    detail: 'This file is 80 MB; Figaro did not read it.',
    guidance: 'Open it externally or reduce its size.',
};

describe('file issue model', () => {
    test('recognizes equivalent backend snapshots independently of object identity and order', () => {
        const danger = {
            ...warning,
            path: 'Locked.md',
            code: 'unreadable',
            severity: 'danger',
            title: 'File couldn’t be read',
        };

        expect(fileIssuesEqual([warning, danger], [{ ...danger }, { ...warning }])).toBe(true);
        expect(fileIssuesEqual([warning], [{ ...warning, detail: 'A different diagnosis.' }])).toBe(false);
    });

    test('normalizes and de-duplicates backend issues without discarding runtime save failures', () => {
        const runtime = upsertRuntimeFileIssue([], {
            path: 'Draft.md',
            code: 'save_failed',
            severity: 'danger',
            title: 'Saving is blocked',
            detail: 'Permission denied.',
            guidance: 'Check permissions and retry.',
        });
        const issues = replaceVaultFileIssues(runtime, [warning, warning]);

        expect(issues).toHaveLength(2);
        expect(issues.map(issue => issue.source).sort()).toEqual(['runtime', 'vault']);
        expect(fileIssueSummary(issues)).toMatchObject({
            severity: 'danger',
            text: 'Saving blocked — action required',
        });
    });

    test('groups cascading disk-full failures into one root incident', () => {
        const issues = normalizeFileIssues([
            { ...warning, path: 'One.md', code: 'disk_full', severity: 'danger', title: 'Disk full' },
            { ...warning, path: 'Two.md', code: 'disk_full', severity: 'danger', title: 'Disk full' },
        ], { source: 'runtime' });

        expect(fileIssueSummary(issues).text).toBe('Disk full — saving blocked');
        expect(groupedFileIssues(issues)).toEqual([
            expect.objectContaining({ paths: ['One.md', 'Two.md'] }),
        ]);
    });

    test('groups startup and per-note Git failures into one degraded-history incident', () => {
        const issues = normalizeFileIssues([
            { ...warning, path: '.git', code: 'history_unavailable', title: 'History unavailable' },
            { ...warning, path: 'Draft.md', code: 'history_failed', title: 'Commit failed', source: 'runtime' },
        ]);

        expect(groupedFileIssues(issues)).toEqual([
            expect.objectContaining({
                title: 'Local history needs attention',
                paths: ['.git', 'Draft.md'],
                source: 'vault',
            }),
        ]);
    });

    test('indexes exact files and collapsed ancestor counts without replacing file identity', () => {
        const danger = {
            ...warning,
            path: 'Archive/Locked/secret.md',
            code: 'unreadable',
            severity: 'danger',
            title: 'File couldn’t be read',
        };
        const index = fileIssueIndex([warning, danger]);

        expect(index.byPath.get('Archive/large.md').code).toBe('too_large');
        expect(index.directories.get('Archive')).toEqual({ count: 2, severity: 'danger' });
        expect(index.directories.get('Archive/Locked')).toEqual({ count: 1, severity: 'danger' });
        expect(fileIssueTreeDescription(warning)).toContain('Press Enter for diagnostics');
    });

    test('counts affected files rather than duplicate diagnoses in collapsed folders', () => {
        const index = fileIssueIndex([
            warning,
            { ...warning, code: 'save_failed', severity: 'danger', source: 'runtime' },
        ]);

        expect(index.directories.get('Archive')).toEqual({ count: 1, severity: 'danger' });
    });

    test('clears only the resolved runtime diagnosis', () => {
        const issues = normalizeFileIssues([
            { ...warning, source: 'vault' },
            { ...warning, source: 'runtime', code: 'history_failed' },
            { ...warning, source: 'runtime', code: 'save_failed' },
        ]);

        const next = removeRuntimeFileIssue(issues, warning.path, ['save_failed']);

        expect(next.map(issue => `${issue.source}:${issue.code}`)).toEqual([
            'runtime:history_failed',
            'vault:too_large',
        ]);
    });
});
