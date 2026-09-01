const severityRank = { warning: 1, danger: 2 };

function isHistoryIssue(issue) {
    return String(issue?.code || '').startsWith('history_');
}

function cleanText(value, fallback = '') {
    return String(value ?? fallback).trim();
}

export function normalizeFileIssue(raw, { source = 'vault' } = {}) {
    const path = cleanText(raw?.path).replaceAll('\\', '/');
    const code = cleanText(raw?.code, 'unreadable').toLowerCase();
    const severity = raw?.severity === 'danger' ? 'danger' : 'warning';
    const title = cleanText(raw?.title, severity === 'danger' ? 'File needs attention' : 'Review this file');
    if (!path || !title) return null;
    return Object.freeze({
        path,
        code,
        severity,
        title,
        detail: cleanText(raw?.detail, 'Figaro left this file unchanged.'),
        guidance: cleanText(raw?.guidance, 'Review the file and check it again.'),
        size: Math.max(0, Number(raw?.size) || 0),
        source: cleanText(raw?.source, source) || source,
        externalFileId: cleanText(raw?.externalFileId),
    });
}

export function normalizeFileIssues(rawIssues, options = {}) {
    const byKey = new Map();
    for (const raw of Array.isArray(rawIssues) ? rawIssues : []) {
        const issue = normalizeFileIssue(raw, options);
        if (!issue) continue;
        byKey.set(`${issue.source}\0${issue.code}\0${issue.path}`, issue);
    }
    return [...byKey.values()].sort((left, right) => (
        (severityRank[right.severity] - severityRank[left.severity])
        || left.path.localeCompare(right.path, undefined, { sensitivity: 'base' })
        || left.code.localeCompare(right.code)
    ));
}

/** Compare normalized diagnoses so repeated backend snapshots stay inert. */
export function fileIssuesEqual(left, right) {
    const normalizedLeft = normalizeFileIssues(left);
    const normalizedRight = normalizeFileIssues(right);
    if (normalizedLeft.length !== normalizedRight.length) return false;
    return normalizedLeft.every((issue, index) => {
        const candidate = normalizedRight[index];
        return issue.path === candidate.path
            && issue.code === candidate.code
            && issue.severity === candidate.severity
            && issue.title === candidate.title
            && issue.detail === candidate.detail
            && issue.guidance === candidate.guidance
            && issue.size === candidate.size
            && issue.source === candidate.source
            && issue.externalFileId === candidate.externalFileId;
    });
}

export function replaceVaultFileIssues(current, backendIssues) {
    return normalizeFileIssues([
        ...normalizeFileIssues(current).filter(issue => issue.source !== 'vault'),
        ...normalizeFileIssues(backendIssues, { source: 'vault' }),
    ]);
}

export function upsertRuntimeFileIssue(current, rawIssue) {
    const issue = normalizeFileIssue({ ...rawIssue, source: 'runtime' }, { source: 'runtime' });
    if (!issue) return normalizeFileIssues(current);
    return normalizeFileIssues([
        ...normalizeFileIssues(current).filter(existing => !(
            existing.source === 'runtime'
            && existing.path === issue.path
            && existing.code === issue.code
        )),
        issue,
    ]);
}

export function removeRuntimeFileIssue(current, path, codes = []) {
    const normalizedPath = cleanText(path).replaceAll('\\', '/');
    const codeSet = new Set(Array.isArray(codes) ? codes : [codes]);
    return normalizeFileIssues(current).filter(issue => !(
        issue.source === 'runtime'
        && issue.path === normalizedPath
        && (!codeSet.size || codeSet.has(issue.code))
    ));
}

export function fileIssueSummary(issues) {
    const normalized = normalizeFileIssues(issues);
    if (!normalized.length) return { count: 0, severity: 'warning', text: '', ariaLabel: '' };
    if (normalized.some(issue => issue.code === 'disk_full')) {
        return {
            count: normalized.length,
            severity: 'danger',
            text: 'Disk full — saving blocked',
            ariaLabel: 'Disk full. Saving is blocked. Open file diagnostics.',
        };
    }
    if (normalized.some(issue => issue.code === 'save_failed')) {
        return {
            count: normalized.length,
            severity: 'danger',
            text: 'Saving blocked — action required',
            ariaLabel: 'Saving is blocked. Action required. Open file diagnostics.',
        };
    }
    if (normalized.some(isHistoryIssue)) {
        return {
            count: normalized.length,
            severity: normalized.some(issue => issue.severity === 'danger') ? 'danger' : 'warning',
            text: 'Local history needs attention',
            ariaLabel: 'Local history needs attention. Open file diagnostics.',
        };
    }
    const dangerCount = normalized.filter(issue => issue.severity === 'danger').length;
    if (dangerCount) {
        return {
            count: normalized.length,
            severity: 'danger',
            text: `${dangerCount} ${dangerCount === 1 ? 'file needs' : 'files need'} urgent attention`,
            ariaLabel: `${dangerCount} ${dangerCount === 1 ? 'file needs' : 'files need'} urgent attention. Open file diagnostics.`,
        };
    }
    return {
        count: normalized.length,
        severity: 'warning',
        text: `${normalized.length} ${normalized.length === 1 ? 'file needs' : 'files need'} attention`,
        ariaLabel: `${normalized.length} ${normalized.length === 1 ? 'file needs' : 'files need'} attention. Open file diagnostics.`,
    };
}

export function fileIssueTreeDescription(issue) {
    const normalized = normalizeFileIssue(issue);
    if (!normalized) return '';
    return `${normalized.title}. ${normalized.detail} ${normalized.guidance} The file was not changed. Press Enter for diagnostics.`;
}

export function fileIssueIndex(issues) {
    const byPath = new Map();
    const directories = new Map();
    for (const issue of normalizeFileIssues(issues)) {
        const previous = byPath.get(issue.path);
        if (!previous || severityRank[issue.severity] > severityRank[previous.severity]) {
            byPath.set(issue.path, issue);
        }
    }
    for (const issue of byPath.values()) {
        const parts = issue.path.split('/').filter(Boolean);
        for (let index = 1; index < parts.length; index += 1) {
            const path = parts.slice(0, index).join('/');
            const summary = directories.get(path) || { count: 0, severity: 'warning' };
            summary.count += 1;
            if (issue.severity === 'danger') summary.severity = 'danger';
            directories.set(path, summary);
        }
    }
    return { byPath, directories };
}

export function groupedFileIssues(issues, preferredPath = '') {
    const normalized = normalizeFileIssues(issues);
    const groups = [];
    const diskFull = normalized.filter(issue => issue.code === 'disk_full');
    if (diskFull.length) {
        const first = diskFull[0];
        groups.push({
            ...first,
            paths: [...new Set(diskFull.map(issue => issue.path))].sort(),
            detail: diskFull.length === 1
                ? first.detail
                : `${diskFull.length} open documents could not be saved. Their latest text remains in memory.`,
        });
    }
    const history = normalized.filter(isHistoryIssue);
    if (history.length) {
        const first = history.find(issue => issue.code === 'history_failed') || history[0];
        groups.push({
            ...first,
            source: history.some(issue => issue.source === 'vault') ? 'vault' : first.source,
            title: 'Local history needs attention',
            paths: [...new Set(history.map(issue => issue.path))].sort(),
        });
    }
    for (const issue of normalized) {
        if (issue.code !== 'disk_full' && !isHistoryIssue(issue)) {
            groups.push({ ...issue, paths: [issue.path] });
        }
    }
    const preferred = cleanText(preferredPath).replaceAll('\\', '/');
    return groups.sort((left, right) => {
        const leftPreferred = left.paths.includes(preferred);
        const rightPreferred = right.paths.includes(preferred);
        return Number(rightPreferred) - Number(leftPreferred)
            || severityRank[right.severity] - severityRank[left.severity]
            || left.paths[0].localeCompare(right.paths[0], undefined, { sensitivity: 'base' });
    });
}
