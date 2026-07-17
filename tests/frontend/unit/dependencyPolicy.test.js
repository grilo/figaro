import fs from 'node:fs';

describe('locked npm dependency policy', () => {
    test('contains no npm-deprecated packages and uses maintained userland punycode', () => {
        const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
        const packages = Object.entries(lock.packages || {});
        const deprecated = packages
            .filter(([, manifest]) => Boolean(manifest.deprecated))
            .map(([path, manifest]) => `${path}: ${manifest.deprecated}`);
        const punycode = packages
            .filter(([path]) => /(^|\/)node_modules\/punycode$/.test(path))
            .map(([, manifest]) => manifest.version);

        expect(deprecated).toEqual([]);
        expect(punycode.length).toBeGreaterThan(0);
        expect(punycode.every(version => Number.parseInt(version, 10) >= 2)).toBe(true);
    });
});
