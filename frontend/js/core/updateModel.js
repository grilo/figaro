/**
 * Pure presentation decisions for in-app updates. The native backend reports
 * one of: unsupported, up-to-date, available, ready, or error.
 */

export function describeUpdateStatus(status = {}) {
    const current = status.currentVersion ? `Figaro ${status.currentVersion}` : 'This build';
    switch (status.state) {
    case 'available':
        return {
            kind: 'available',
            message: `Figaro ${status.version} is available. You are running ${status.currentVersion || 'an older version'}.`,
            action: 'install',
        };
    case 'ready':
        return {
            kind: 'ready',
            message: 'The update is downloaded and verified. Restart Figaro to finish.',
            action: 'restart',
        };
    case 'up-to-date':
        return { kind: 'current', message: `${current} is the latest release.`, action: null };
    case 'unsupported':
        return {
            kind: 'unsupported',
            message: `${current} cannot update itself. Download new releases from GitHub.`,
            action: null,
        };
    case 'error':
        return {
            kind: 'error',
            message: status.error || 'Figaro could not check for updates.',
            action: null,
        };
    default:
        return { kind: 'idle', message: 'Checks GitHub Releases only when you ask or when Figaro starts.', action: null };
    }
}

export function updateActionLabel(action) {
    if (action === 'install') return 'Download and install';
    if (action === 'restart') return 'Restart to update';
    return '';
}
