import fs from 'node:fs';

const readJSON = path => JSON.parse(fs.readFileSync(path, 'utf8'));

test('pins ESLint’s vulnerable legacy brace-expansion without replacing newer branches', () => {
    const pkg = readJSON('package.json');
    const lock = readJSON('package-lock.json');

    expect(pkg.overrides.eslint.minimatch['brace-expansion']).toBe('1.1.16');
    expect(lock.packages['node_modules/brace-expansion'].version).toBe('1.1.16');
    expect(lock.packages['node_modules/glob/node_modules/brace-expansion'].version).toBe('5.0.7');
    expect(lock.packages['node_modules/test-exclude/node_modules/brace-expansion'].version).toBe('5.0.7');
});
