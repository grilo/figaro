const path = require('node:path');
const { parse } = require('@babel/parser');

function validateFeatureMap(features) {
    if (!Array.isArray(features) || !features.length) throw new Error('Feature map must be a non-empty array');
    const ids = new Set();
    for (const feature of features) {
        if (!/^[a-z][a-z0-9-]*$/.test(feature.id) || ids.has(feature.id)) throw new Error(`Invalid or duplicate feature: ${feature.id}`);
        ids.add(feature.id);
        if (typeof feature.title !== 'string' || !feature.title.trim()) throw new Error(`Missing title: ${feature.id}`);
        for (const field of ['sources', 'docs', 'tests', 'extraChecks']) {
            if (!Array.isArray(feature[field]) || !feature[field].length || feature[field].some(value => typeof value !== 'string' || !value.trim())) {
                throw new Error(`Missing ${field}: ${feature.id}`);
            }
        }
        for (const ref of [...feature.sources, ...feature.docs, ...feature.tests]) {
            if (!/^[a-zA-Z0-9_.\/-]+(?:#[a-z0-9-]+)?$/.test(ref) || ref.startsWith('/') || ref.split('/').includes('..')) {
                throw new Error(`Invalid repository reference: ${ref}`);
            }
        }
        if (feature.tests.some(file => !/^tests\/frontend\/.+\.test\.js$/.test(file))) throw new Error(`Expected explicit frontend tests: ${feature.id}`);
        if (feature.symbols !== undefined) {
            if (!feature.symbols || typeof feature.symbols !== 'object' || Array.isArray(feature.symbols)) throw new Error(`Invalid symbols: ${feature.id}`);
            for (const [file, names] of Object.entries(feature.symbols)) {
                if (!feature.sources.includes(file) || !/\.[cm]?js$/.test(file)
                    || !Array.isArray(names) || !names.length || names.some(name => typeof name !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(name))) {
                    throw new Error(`Invalid source symbols: ${feature.id} -> ${file}`);
                }
            }
        }
    }
    return features;
}

function declaredSymbols(source) {
    const names = new Set();
    for (const statement of parse(source, { sourceType: 'unambiguous' }).program.body) {
        const declaration = statement.declaration || statement;
        if (declaration.id?.type === 'Identifier') names.add(declaration.id.name);
        for (const binding of declaration.declarations || []) {
            if (binding.id.type === 'Identifier') names.add(binding.id.name);
        }
    }
    return names;
}

function renderContextList(features) {
    validateFeatureMap(features);
    return features.map(feature => `${feature.id}: ${feature.title}`).join('\n');
}

function renderContext(features) {
    validateFeatureMap(features);
    return features.map(feature => `${feature.id}: ${feature.title}\n`
        + 'Source (path :: symbols):\n'
        + feature.sources.map(file => `  ${file}${feature.symbols?.[file] ? ` :: ${feature.symbols[file].join(', ')}` : ''}`).join('\n')
        + `\nDocs:\n${feature.docs.map(ref => `  ${ref}`).join('\n')}`
        + `\nTests (npm run test:focus -- ${feature.id}):\n${feature.tests.map(file => `  ${file}`).join('\n')}`
        + `\nAdditional boundaries: ${feature.extraChecks.join(' ')}`).join('\n\n')
        + '\nPaths are repository-relative. Follow callers and shared contracts when the change crosses this route.';
}

function selectFeatures(features, ids) {
    validateFeatureMap(features);
    if (!ids.length) throw new Error('Choose at least one feature from npm run context');
    return [...new Set(ids)].map(id => {
        const feature = features.find(candidate => candidate.id === id);
        if (!feature) throw new Error(`Unknown feature: ${id}. Run npm run context to list routes.`);
        return feature;
    });
}

function focusedTests(features) {
    return [...new Set(['tests/frontend/unit/architecturePolicy.test.js', ...features.flatMap(feature => feature.tests)])];
}

function focusedFailureSummary(report) {
    const failures = (report.testResults || []).flatMap(suite => {
        const assertions = (suite.assertionResults || []).filter(assertion => assertion.status === 'failed');
        if (assertions.length) return assertions.map(assertion => `${assertion.fullName}\n${(assertion.failureMessages || []).join('\n')}`);
        return suite.status === 'failed' ? [suite.message || suite.name] : [];
    });
    return failures.join('\n\n').slice(0, 6000);
}

function renderFeatureIndex(features) {
    validateFeatureMap(features);
    const link = ref => `[${ref}](${path.posix.relative('docs', ref.split('#')[0])}${ref.includes('#') ? `#${ref.split('#')[1]}` : ''})`;
    return '# Feature index\n\n'
        + 'Generated from `docs/feature-map.json`; edit that map and run `npm run context:generate`.\n'
        + 'Start with `npm run context` for a compact route list, then `npm run context -- <feature>` for paths, symbols, and sections.\n'
        + 'This full index is the browsable reference. Use `npm run test:focus -- <feature> [feature…]` for frontend checks.\n\n'
        + 'Routes name entry points, not every dependency. Follow imports and callers when the change crosses a boundary.\n'
        + 'Focused tests include integrity and architecture checks but do not replace affected Go, coverage, browser, native, or release checks.\n'
        + 'Read the root [agent instructions](../AGENTS.md) and its applicable contracts before editing.\n\n'
        + '| Feature | Route |\n| --- | --- |\n'
        + features.map(feature => `| ${feature.title} | [${feature.id}](#${feature.id}) |`).join('\n') + '\n\n'
        + features.map(feature => `## ${feature.id}\n\n${feature.title}\n\n`
            + `- Source: ${feature.sources.map(file => link(file) + (feature.symbols?.[file] ? ` (${feature.symbols[file].map(name => `\`${name}\``).join(', ')})` : '')).join(', ')}\n`
            + `- Documentation: ${feature.docs.map(link).join(', ')}\n`
            + `- Frontend tests: ${feature.tests.map(link).join(', ')}\n`
            + `- Additional boundary checks: ${feature.extraChecks.join(' ')}\n`).join('\n');
}

module.exports = { validateFeatureMap, selectFeatures, declaredSymbols, renderContextList, renderContext, focusedTests, focusedFailureSummary, renderFeatureIndex };
