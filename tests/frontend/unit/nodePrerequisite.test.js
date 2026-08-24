import {
    NODE_VERSION_DESCRIPTION,
    NODE_VERSION_REQUIREMENT,
    isSupportedNodeVersion,
} from '../../../scripts/check-node-version.js';
import fs from 'node:fs';

test('accepts only the Node release lines supported by the lint toolchain', () => {
    expect(NODE_VERSION_REQUIREMENT).toBe('^22.18.0 || >=24.11.0');
    expect(NODE_VERSION_DESCRIPTION).toBe('Node.js 22.18+ (22.x) or 24.11+');

    for (const version of ['v22.18.0', '22.99.0', '24.11.0', '24.99.0', '25.0.0']) {
        expect(isSupportedNodeVersion(version)).toBe(true);
    }
    for (const version of [
        '20.99.0',
        '21.7.3',
        '22.17.9',
        '22.18.0-prerelease',
        '23.11.1',
        '24.10.9',
        'invalid',
    ]) {
        expect(isSupportedNodeVersion(version)).toBe(false);
    }
});

test('publishes the same Node requirement in package metadata and prerequisite checks', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const makefile = fs.readFileSync('Makefile', 'utf8');
    const frontendPreparation = fs.readFileSync('scripts/prepare-frontend.sh', 'utf8');

    expect(pkg.engines.node).toBe(NODE_VERSION_REQUIREMENT);
    expect(makefile).toContain('node ./scripts/check-node-version.js');
    expect(frontendPreparation).toContain('node ./scripts/check-node-version.js');
});
