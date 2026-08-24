import path from 'node:path';

export const NODE_VERSION_REQUIREMENT = '^22.18.0 || >=24.11.0';
export const NODE_VERSION_DESCRIPTION = 'Node.js 22.18+ (22.x) or 24.11+';

export function isSupportedNodeVersion(version) {
    const match = String(version).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) {
        return false;
    }

    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (major === 22) {
        return minor >= 18;
    }
    if (major === 24) {
        return minor >= 11;
    }
    return major > 24;
}

function checkCurrentNodeVersion() {
    if (isSupportedNodeVersion(process.versions.node)) {
        return;
    }

    process.stderr.write(
        `Figaro requires ${NODE_VERSION_DESCRIPTION}; found ${process.version}.\n`,
    );
    process.exitCode = 1;
}

const invokedScript = process.argv[1] ? path.basename(process.argv[1]) : '';
if (invokedScript === 'check-node-version.js') {
    checkCurrentNodeVersion();
}
