const fs = require('node:fs');
const path = require('node:path');

const usage = 'Usage: node sync-release-metadata.mjs <MAJOR.MINOR.PATCH|vMAJOR.MINOR.PATCH> [--date YYYY-MM-DD] [--root PATH] [--dry-run]';
const changelogRepository = 'https://github.com/grilo/figaro';
const keepAChangelogCategories = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

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

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unreleasedHeading(changelog) {
    return /^## (?:\[Unreleased\]|Unreleased)\s*$/m.exec(changelog);
}

function releaseHeading(version) {
    return new RegExp(`^## \\[?${escapeRegExp(version)}\\]? - (\\d{4}-\\d{2}-\\d{2})\\s*$`, 'm');
}

function updateComparisonLinks(changelog, version, previousVersion) {
    const definitions = /^\[(?:Unreleased|\d+\.\d+\.\d+)\]:\s+https:\/\/github\.com\/grilo\/figaro\/compare\/.*$/gm;
    const existing = changelog.match(definitions) || [];
    const retained = existing.filter(line => !line.startsWith('[Unreleased]:') && !line.startsWith(`[${version}]:`));
    const body = changelog.replace(definitions, '').trimEnd();
    const links = [
        `[Unreleased]: ${changelogRepository}/compare/v${version}...HEAD`,
        `[${version}]: ${changelogRepository}/compare/v${previousVersion}...v${version}`,
        ...retained,
    ];
    return `${body}\n\n${links.join('\n')}\n`;
}

function existingReleaseDate(changelog, version) {
    const heading = unreleasedHeading(changelog);
    if (!heading) return null;

    const following = changelog.slice(heading.index + heading[0].length);
    const nextHeadingOffset = following.search(/^## /m);
    if (nextHeadingOffset === -1) return null;

    const unreleased = following.slice(0, nextHeadingOffset).trim();
    const matchingRelease = releaseHeading(version).exec(
        following.slice(nextHeadingOffset),
    );
    return unreleased === '_No changes yet._' && matchingRelease ? matchingRelease[1] : null;
}

function cutChangelog(changelog, version, releaseDate) {
    const heading = unreleasedHeading(changelog);
    if (!heading) fail([
        'CHANGELOG.md has no "## [Unreleased]" heading.',
        'Restore an Unreleased section above the dated releases, add the changes for this release there, then retry.',
    ].join('\n'));

    const afterHeading = heading.index + heading[0].length;
    const following = changelog.slice(afterHeading);
    const nextHeadingOffset = following.search(/^## /m);
    if (nextHeadingOffset === -1) fail([
        'CHANGELOG.md has no dated release after "Unreleased".',
        'Restore the next dated release heading, add the changes for this release under Unreleased, then retry.',
    ].join('\n'));

    const unreleased = following.slice(0, nextHeadingOffset).trim();
    if (new RegExp(`^## \\[?${escapeRegExp(version)}\\]? - `).test(following.slice(nextHeadingOffset))) {
        fail([
            `CHANGELOG.md already contains ${version}; resolve its Unreleased entries before retrying.`,
            `If ${version} is the interrupted release, rerun that exact version from its release commit to resume it.`,
            'Otherwise move the pending entries into the intended Unreleased section before retrying.',
        ].join('\n'));
    }
    if (!unreleased || unreleased === '_No changes yet._') {
        fail([
            'CHANGELOG.md has no accumulated Unreleased entries to release.',
            `Nothing new is ready to release as v${version}.`,
            'To prepare a release:',
            '  1. Add a concise user-facing entry under "## [Unreleased]", grouped beneath a Keep a Changelog category.',
            '  2. Run the same release command again.',
            'If there is no user-facing change to add, do not create a release.',
        ].join('\n'));
    }
    if (!new RegExp(`^### (${keepAChangelogCategories.join('|')})\\s*$`, 'm').test(unreleased)) {
        fail([
            'Unreleased entries must use Keep a Changelog category headings.',
            `Move the pending entries beneath one of: ${keepAChangelogCategories.join(', ')}.`,
            'Then run the same release command again.',
        ].join('\n'));
    }

    const remainder = following.slice(nextHeadingOffset).trim();
    const previousRelease = /^## \[?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\]? - \d{4}-\d{2}-\d{2}\s*$/m.exec(remainder);
    if (!previousRelease) fail('CHANGELOG.md has no previous stable release heading after Unreleased.');
    const before = `${changelog.slice(0, heading.index).trimEnd()}\n\n## [Unreleased]`;
    const cut = `${before}\n\n_No changes yet._\n\n## [${version}] - ${releaseDate}\n\n${unreleased}\n\n${remainder}\n`;
    return updateComparisonLinks(cut, version, previousRelease[1]);
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

    const previousReleaseDate = existingReleaseDate(changelog, version);
    const resolvedReleaseDate = previousReleaseDate || releaseDate;
    const updates = new Map([
        ['package.json', formatJson(pkg)],
        ['package-lock.json', formatJson(lock)],
        ['wails.json', formatJson(wails)],
        ['CHANGELOG.md', previousReleaseDate ? changelog : cutChangelog(changelog, version, releaseDate)],
    ]);
    const changedUpdates = new Map([...updates].filter(([filename, content]) => (
        fs.readFileSync(path.join(resolvedRoot, filename), 'utf8') !== content
    )));

    if (!dryRun) {
        for (const [filename, content] of changedUpdates) {
            fs.writeFileSync(path.join(resolvedRoot, filename), content);
        }
    }

    return { version, releaseDate: resolvedReleaseDate, files: [...changedUpdates.keys()], dryRun };
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
