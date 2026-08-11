const fs = require('node:fs');
const path = require('node:path');

const keepAChangelogCategories = [
    'Added',
    'Changed',
    'Deprecated',
    'Removed',
    'Fixed',
    'Security',
];

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stableVersion(value) {
    const version = String(value || '').replace(/^v/, '');
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
        throw new Error(`"${value}" is not a stable vMAJOR.MINOR.PATCH version`);
    }
    return version;
}

/** Extract and validate one curated Keep a Changelog release body. */
function extractReleaseNotes(changelog, requestedVersion) {
    const version = stableVersion(requestedVersion);
    const lines = String(changelog ?? '').split(/\r?\n/);
    const releaseHeading = new RegExp(
        `^## \\[?${escapeRegExp(version)}\\]? - \\d{4}-\\d{2}-\\d{2}$`,
    );
    const start = lines.findIndex(line => releaseHeading.test(line));
    if (start < 0) throw new Error(`CHANGELOG.md has no dated release section for v${version}`);

    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
        if (/^## /.test(lines[index]) || /^\[(?:Unreleased|\d+\.\d+\.\d+)\]:\s+/.test(lines[index])) {
            end = index;
            break;
        }
    }
    const bodyLines = lines.slice(start + 1, end);
    while (!bodyLines[0]?.trim()) bodyLines.shift();
    while (!bodyLines.at(-1)?.trim()) bodyLines.pop();
    if (!bodyLines.length || bodyLines.join('\n').trim() === '_No changes yet._') {
        throw new Error(`v${version} has no curated release notes`);
    }

    const categoryIndexes = [];
    for (let index = 0; index < bodyLines.length; index += 1) {
        const match = /^### (.+)$/.exec(bodyLines[index]);
        if (!match) continue;
        const order = keepAChangelogCategories.indexOf(match[1]);
        if (order < 0) {
            throw new Error(`v${version} uses unsupported changelog category "${match[1]}"`);
        }
        categoryIndexes.push({ index, name: match[1], order });
    }
    if (!categoryIndexes.length) {
        throw new Error(`v${version} has no Keep a Changelog category headings`);
    }
    for (let index = 0; index < categoryIndexes.length; index += 1) {
        const category = categoryIndexes[index];
        const next = categoryIndexes[index + 1]?.index ?? bodyLines.length;
        const entries = bodyLines.slice(category.index + 1, next).join('\n');
        if (!/^-\s+\S/m.test(entries)) {
            throw new Error(`v${version} category "${category.name}" has no release-note entries`);
        }
        if (index > 0 && category.order <= categoryIndexes[index - 1].order) {
            throw new Error(`v${version} changelog categories are duplicated or out of Keep a Changelog order`);
        }
    }

    return `${bodyLines.join('\n')}\n`;
}

function parseArguments(args) {
    const requestedVersion = args[0];
    let output = null;
    if (!requestedVersion) throw new Error('use: node scripts/extract-release-notes.mjs vMAJOR.MINOR.PATCH [--output PATH]');
    for (let index = 1; index < args.length; index += 1) {
        if (args[index] !== '--output' || !args[index + 1] || output) {
            throw new Error('use: node scripts/extract-release-notes.mjs vMAJOR.MINOR.PATCH [--output PATH]');
        }
        output = args[index + 1];
        index += 1;
    }
    return { requestedVersion, output };
}

function main(args = process.argv.slice(2), root = process.cwd()) {
    try {
        const { requestedVersion, output } = parseArguments(args);
        const notes = extractReleaseNotes(
            fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'),
            requestedVersion,
        );
        if (output) fs.writeFileSync(path.resolve(root, output), notes);
        else process.stdout.write(notes);
    } catch (error) {
        console.error(`Release notes were not generated: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}

module.exports = { extractReleaseNotes, keepAChangelogCategories, main };
