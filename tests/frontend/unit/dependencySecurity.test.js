import fs from 'node:fs';

const readJSON = path => JSON.parse(fs.readFileSync(path, 'utf8'));

const isPatchedBraceExpansion = version => {
    const [major, minor, patch] = version.split('.').map(Number);
    return major > 5 || (major === 5 && (minor > 0 || (minor === 0 && patch >= 8)));
};

test('keeps every brace-expansion dependency above the denial-of-service advisory range', () => {
    const pkg = readJSON('package.json');
    const lock = readJSON('package-lock.json');
    const braceExpansionPackages = Object.entries(lock.packages)
        .filter(([packagePath]) => packagePath.endsWith('/brace-expansion'));

    expect(pkg.devDependencies.eslint).toMatch(/^\^10\./);
    expect(pkg.devDependencies['@eslint/js']).toMatch(/^\^10\./);
    expect(pkg.overrides).not.toHaveProperty('eslint');
    expect(braceExpansionPackages.length).toBeGreaterThan(0);
    for (const [, dependency] of braceExpansionPackages) {
        expect(isPatchedBraceExpansion(dependency.version)).toBe(true);
    }
});
