import path from 'node:path';

export const NODE_VERSION_REQUIREMENT = '^20.19.0 || ^22.13.0 || >=24.0.0';
export const NODE_VERSION_DESCRIPTION = 'Node.js 20.19+ (20.x), 22.13+ (22.x), or 24+';

export function isSupportedNodeVersion(version) {
    const match = String(version).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) {
        return false;
    }

    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (major === 20) {
        return minor >= 19;
    }
    if (major === 22) {
        return minor >= 13;
    }
    return major >= 24;
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
