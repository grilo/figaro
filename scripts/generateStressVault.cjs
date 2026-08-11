const fs = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const {
    buildStressVaultPlan,
    hugeDocumentContent,
    smallDocumentContent,
} = require('./stressVaultPlan.cjs');

const usage = 'use: node scripts/generate-stress-vault.mjs --output PATH [--documents COUNT] [--huge-documents COUNT] [--huge-lines COUNT] [--replace]';

function parseArguments(args) {
    const parsed = { replace: false };
    const numeric = {
        '--documents': 'documentCount',
        '--huge-documents': 'hugeDocumentCount',
        '--huge-lines': 'hugeLineCount',
    };
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === '--replace') {
            if (parsed.replace) throw new Error(usage);
            parsed.replace = true;
            continue;
        }
        const property = argument === '--output' ? 'output' : numeric[argument];
        const value = args[index + 1];
        if (!property || !value || value.startsWith('--') || parsed[property] !== undefined) {
            throw new Error(usage);
        }
        parsed[property] = property === 'output' ? value : Number(value);
        index += 1;
    }
    if (!parsed.output) throw new Error(usage);
    return parsed;
}

function safeOutputPath(output, root) {
    const resolved = path.resolve(root, output);
    if (resolved === path.parse(resolved).root || resolved === path.resolve(root)) {
        throw new Error('the stress-vault output must be a dedicated child directory');
    }
    return resolved;
}

async function pathExists(target) {
    try {
        await fs.stat(target);
        return true;
    } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
    }
}

async function isGeneratedStressVault(target) {
    try {
        const info = await fs.lstat(target);
        if (!info.isDirectory() || info.isSymbolicLink()) return false;
        const marker = JSON.parse(await fs.readFile(path.join(target, '.figaro-stress-vault.json'), 'utf8'));
        return marker?.format === 1 && Number.isSafeInteger(marker.documentCount);
    } catch (error) {
        if (error?.code === 'ENOENT' || error instanceof SyntaxError) return false;
        throw error;
    }
}

async function copyInBatches(source, targets, batchSize = 128) {
    for (let start = 0; start < targets.length; start += batchSize) {
        await Promise.all(targets.slice(start, start + batchSize).map(target => fs.copyFile(source, target)));
    }
}

async function generateStressVault(options, root = process.cwd()) {
    const plan = buildStressVaultPlan(options);
    const output = safeOutputPath(options.output, root);
    if (await pathExists(output)) {
        if (!options.replace) throw new Error(`${output} already exists; pass --replace to regenerate it`);
        if (!await isGeneratedStressVault(output)) {
            throw new Error(`${output} is not a generated stress vault; refusing to replace it`);
        }
        await fs.rm(output, { recursive: true, force: false });
    }

    const started = performance.now();
    await fs.mkdir(output, { recursive: true });
    const directories = new Set(plan.documents.map(document => path.dirname(document.path)));
    await Promise.all([...directories].map(directory => fs.mkdir(path.join(output, directory), { recursive: true })));

    const smallSource = path.join(output, plan.sources.small);
    const hugeSource = path.join(output, plan.sources.huge);
    await Promise.all([
        fs.writeFile(smallSource, smallDocumentContent(), 'utf8'),
        fs.writeFile(hugeSource, hugeDocumentContent(plan.hugeLineCount), 'utf8'),
    ]);

    await copyInBatches(
        smallSource,
        plan.documents.filter(document => document.template === 'small' && !document.source)
            .map(document => path.join(output, document.path)),
    );
    await copyInBatches(
        hugeSource,
        plan.documents.filter(document => document.template === 'huge' && !document.source)
            .map(document => path.join(output, document.path)),
    );

    const manifest = {
        format: 1,
        generatedAt: new Date().toISOString(),
        documentCount: plan.documentCount,
        smallDocumentCount: plan.smallDocumentCount,
        hugeDocumentCount: plan.hugeDocumentCount,
        hugeLineCount: plan.hugeLineCount,
        sources: plan.sources,
        needles: plan.needles,
    };
    await fs.writeFile(
        path.join(output, '.figaro-stress-vault.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
    );
    return {
        output,
        elapsedMs: Math.round((performance.now() - started) * 10) / 10,
        ...manifest,
    };
}

async function main(args = process.argv.slice(2), root = process.cwd()) {
    try {
        const result = await generateStressVault(parseArguments(args), root);
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
        console.error(`Stress vault was not generated: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}

module.exports = { generateStressVault, isGeneratedStressVault, main, parseArguments, safeOutputPath };
