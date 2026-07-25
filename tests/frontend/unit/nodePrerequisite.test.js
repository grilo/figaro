import {
    NODE_VERSION_DESCRIPTION,
    NODE_VERSION_REQUIREMENT,
    isSupportedNodeVersion,
} from '../../../scripts/check-node-version.js';
import fs from 'node:fs';

test('accepts only the Node release lines supported by the lint toolchain', () => {
    expect(NODE_VERSION_REQUIREMENT).toBe('^20.19.0 || ^22.13.0 || >=24.0.0');
    expect(NODE_VERSION_DESCRIPTION).toBe('Node.js 20.19+ (20.x), 22.13+ (22.x), or 24+');

    for (const version of ['20.19.0', '20.99.0', 'v22.13.0', '22.99.0', '24.0.0', '25.0.0']) {
        expect(isSupportedNodeVersion(version)).toBe(true);
    }
    for (const version of [
        '20.18.9',
        '20.19.0-prerelease',
        '21.7.3',
        '22.12.9',
        '23.11.1',
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
