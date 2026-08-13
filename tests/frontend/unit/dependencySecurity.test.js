import fs from 'node:fs';

const readJSON = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const readText = path => fs.readFileSync(path, 'utf8');

const parseGoVersion = version => version.slice(1).split('.').map(Number);

const isAtLeastGoVersion = (version, minimum) => {
    const actualParts = parseGoVersion(version);
    const minimumParts = parseGoVersion(minimum);
    return minimumParts.every((part, index) => {
        const precedingPartsMatch = minimumParts
            .slice(0, index)
            .every((precedingPart, precedingIndex) => actualParts[precedingIndex] === precedingPart);
        return !precedingPartsMatch || actualParts[index] >= part;
    });
};

const isPatchedBraceExpansion = version => {
    const [major, minor, patch] = version.split('.').map(Number);
    return major > 5 || (major === 5 && (minor > 0 || (minor === 0 && patch >= 9)));
};

const isPatchedJsYaml = version => {
    const [major, minor, patch] = version.split('.').map(Number);
    if (major > 4) return true;
    if (major === 4) return minor > 3 || (minor === 3 && patch >= 1);
    if (major === 3) return minor > 15 || (minor === 15 && patch >= 1);
    return false;
};

test('keeps every npm dependency above the known denial-of-service advisory ranges', () => {
    const pkg = readJSON('package.json');
    const lock = readJSON('package-lock.json');
    const braceExpansionPackages = Object.entries(lock.packages)
        .filter(([packagePath]) => packagePath.endsWith('/brace-expansion'));
    const jsYamlPackages = Object.entries(lock.packages)
        .filter(([packagePath]) => packagePath.endsWith('/js-yaml'));

    expect(pkg.devDependencies.eslint).toMatch(/^\^10\./);
    expect(pkg.devDependencies['@eslint/js']).toMatch(/^\^10\./);
    expect(pkg.overrides).not.toHaveProperty('eslint');
    expect(braceExpansionPackages.length).toBeGreaterThan(0);
    for (const [, dependency] of braceExpansionPackages) {
        expect(isPatchedBraceExpansion(dependency.version)).toBe(true);
    }
    expect(jsYamlPackages.length).toBeGreaterThan(0);
    for (const [, dependency] of jsYamlPackages) {
        expect(isPatchedJsYaml(dependency.version)).toBe(true);
    }
});

test('keeps the reachable WebP decoder above the GO-2026-5061 advisory range', () => {
    const goMod = readText('go.mod');
    const match = goMod.match(/^\s*golang\.org\/x\/image\s+(v\d+\.\d+\.\d+)/m);

    expect(match).not.toBeNull();
    expect(isAtLeastGoVersion(match[1], 'v0.43.0')).toBe(true);
});
