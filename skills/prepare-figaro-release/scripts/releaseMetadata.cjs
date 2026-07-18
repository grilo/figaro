const fs = require('node:fs');
const path = require('node:path');

const usage = 'Usage: node sync-release-metadata.mjs <MAJOR.MINOR.PATCH|vMAJOR.MINOR.PATCH> [--date YYYY-MM-DD] [--root PATH] [--dry-run]';

class ReleaseMetadataError extends Error {}

function fail(message) {
    throw new ReleaseMetadataError(message);
}

function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function readJson(root, filename) {
    try {
        return JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8'));
    } catch (error) {
        fail(`could not read ${filename}: ${error.message}`);
    }
}

function formatJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function cutChangelog(changelog, version, releaseDate) {
    const heading = /^## Unreleased\s*$/m.exec(changelog);
    if (!heading) fail('CHANGELOG.md has no "## Unreleased" heading.');

    const afterHeading = heading.index + heading[0].length;
    const following = changelog.slice(afterHeading);
    const nextHeadingOffset = following.search(/^## /m);
    if (nextHeadingOffset === -1) fail('CHANGELOG.md has no dated release after "Unreleased".');

    const unreleased = following.slice(0, nextHeadingOffset).trim();
    if (!unreleased || unreleased === '_No changes yet._') {
        fail('CHANGELOG.md has no accumulated Unreleased entries to release.');
    }
    if (!/^### (Added|Changed|Fixed)\s*$/m.test(unreleased)) {
        fail('Unreleased changelog entries must be grouped under Added, Changed, or Fixed.');
    }

    const remainder = following.slice(nextHeadingOffset).trimStart();
    const before = changelog.slice(0, afterHeading).trimEnd();
    return `${before}\n\n_No changes yet._\n\n## ${version} - ${releaseDate}\n\n${unreleased}\n\n${remainder}\n`;
}

function parseArguments(args) {
    let requestedVersion;
    let releaseDate = new Date().toISOString().slice(0, 10);
    let root = process.cwd();
    let dryRun = false;

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--date' || arg === '--root') {
            const value = args[index + 1];
            if (!value) fail(`${arg} requires a value.\n${usage}`);
            if (arg === '--date') releaseDate = value;
            else root = value;
            index += 1;
        } else if (arg === '--dry-run') {
            dryRun = true;
        } else if (!requestedVersion) {
            requestedVersion = arg;
        } else {
            fail(`unexpected argument: ${arg}\n${usage}`);
        }
    }

    if (!requestedVersion) fail(usage);
    return { requestedVersion, releaseDate, root, dryRun };
}

function syncReleaseMetadata({ requestedVersion, releaseDate, root, dryRun = false }) {
    const version = requestedVersion.replace(/^v/, '');
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
        fail(`"${requestedVersion}" is not a stable MAJOR.MINOR.PATCH version.`);
    }
    if (!parseDate(releaseDate)) fail(`"${releaseDate}" is not a valid YYYY-MM-DD date.`);

    const resolvedRoot = path.resolve(root);
    for (const filename of ['package.json', 'package-lock.json', 'wails.json', 'CHANGELOG.md']) {
        if (!fs.existsSync(path.join(resolvedRoot, filename))) fail(`expected ${filename} in ${resolvedRoot}.`);
    }

    const pkg = readJson(resolvedRoot, 'package.json');
    const lock = readJson(resolvedRoot, 'package-lock.json');
    const wails = readJson(resolvedRoot, 'wails.json');
    const changelog = fs.readFileSync(path.join(resolvedRoot, 'CHANGELOG.md'), 'utf8');

    if (!lock.packages?.['']) fail('package-lock.json has no root package entry.');
    if (!wails.info) fail('wails.json has no info object.');

    pkg.version = version;
    lock.version = version;
    lock.packages[''].version = version;
    wails.info.productVersion = version;

    const updates = new Map([
        ['package.json', formatJson(pkg)],
        ['package-lock.json', formatJson(lock)],
        ['wails.json', formatJson(wails)],
        ['CHANGELOG.md', cutChangelog(changelog, version, releaseDate)],
    ]);

    if (!dryRun) {
        for (const [filename, content] of updates) {
            fs.writeFileSync(path.join(resolvedRoot, filename), content);
        }
    }

    return { version, releaseDate, files: [...updates.keys()], dryRun };
}

function main(args) {
    try {
        const result = syncReleaseMetadata(parseArguments(args));
        const action = result.dryRun ? 'Would synchronize' : 'Synchronized';
        console.log(`${action} Figaro release metadata for v${result.version} dated ${result.releaseDate}.`);
        if (result.dryRun) for (const filename of result.files) console.log(`  ${filename}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Release metadata was not changed: ${message}`);
        process.exitCode = 1;
    }
}

module.exports = { ReleaseMetadataError, main, syncReleaseMetadata };
