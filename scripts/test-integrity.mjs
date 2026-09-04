import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '@babel/parser';

const ASSERTION_MATCHERS = new Set([
    'toBe', 'toEqual', 'toStrictEqual', 'toContain', 'toMatch', 'toBeTruthy', 'toBeFalsy',
    'toBeDefined', 'toBeUndefined', 'toBeNull', 'toHaveLength',
]);
const SUSPICIOUS_COMMENT_PATTERNS = [
    /replicat(?:e|es|ed|ing) (?:the )?(?:core )?logic/i,
    /simulat(?:e|es|ed|ing) what .* (?:does|builds|produces)/i,
    /verified by code inspection/i,
    /if we got here.*test passes/i,
];

function walk(node, visit, parent = null) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') visit(node, parent);
    for (const [key, value] of Object.entries(node)) {
        if (['loc', 'start', 'end', 'extra', 'leadingComments', 'innerComments', 'trailingComments'].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(child => walk(child, visit, node));
        else if (value && typeof value === 'object') walk(value, visit, node);
    }
}

function propertyName(member) {
    if (!member || member.type !== 'MemberExpression') return null;
    if (!member.computed && member.property.type === 'Identifier') return member.property.name;
    if (member.computed && member.property.type === 'StringLiteral') return member.property.value;
    return null;
}

function expectMatcher(node) {
    if (node?.type !== 'CallExpression' || node.callee?.type !== 'MemberExpression') return null;
    let chain = node.callee.object;
    if (chain?.type === 'MemberExpression' && propertyName(chain) === 'not') chain = chain.object;
    if (chain?.type !== 'CallExpression' || chain.callee?.type !== 'Identifier' || chain.callee.name !== 'expect') return null;
    return {
        actual: chain.arguments[0],
        expected: node.arguments[0],
        matcher: propertyName(node.callee),
    };
}

function normalizedSource(source, node) {
    return node ? source.slice(node.start, node.end).replace(/\s+/g, '') : '';
}

function containsIdentifier(node, name) {
    let found = false;
    walk(node, child => {
        if (child.type === 'Identifier' && child.name === name) found = true;
    });
    return found;
}

function collectDeclarations(callback) {
    const declarations = new Map();
    walk(callback.body, node => {
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
            declarations.set(node.id.name, node.init);
        }
        if (node.type === 'FunctionDeclaration' && node.id) declarations.set(node.id.name, node);
    });
    return declarations;
}

function syntheticExpression(node, declarations, seen = new Set(), localNames = new Set()) {
    if (!node) return true;
    if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral', 'RegExpLiteral'].includes(node.type)) return true;
    if (node.type === 'Identifier') {
        if (localNames.has(node.name)) return true;
        if (!declarations.has(node.name) || seen.has(node.name)) return false;
        return syntheticExpression(declarations.get(node.name), declarations, new Set([...seen, node.name]), localNames);
    }
    if (node.type === 'TemplateLiteral') {
        return node.expressions.every(expression => syntheticExpression(expression, declarations, seen, localNames));
    }
    if (node.type === 'ArrayExpression') {
        return node.elements.every(element => syntheticExpression(element, declarations, seen, localNames));
    }
    if (node.type === 'ObjectExpression') {
        return node.properties.every(property => syntheticExpression(property.value, declarations, seen, localNames));
    }
    if (['BinaryExpression', 'LogicalExpression'].includes(node.type)) {
        return syntheticExpression(node.left, declarations, seen, localNames)
            && syntheticExpression(node.right, declarations, seen, localNames);
    }
    if (node.type === 'UnaryExpression') return syntheticExpression(node.argument, declarations, seen, localNames);
    if (node.type === 'ConditionalExpression') {
        return syntheticExpression(node.test, declarations, seen, localNames)
            && syntheticExpression(node.consequent, declarations, seen, localNames)
            && syntheticExpression(node.alternate, declarations, seen, localNames);
    }
    if (node.type === 'MemberExpression') return syntheticExpression(node.object, declarations, seen, localNames);
    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') {
        const parameters = new Set(localNames);
        for (const parameter of node.params) {
            if (parameter.type === 'Identifier') parameters.add(parameter.name);
        }
        return syntheticExpression(node.body, declarations, seen, parameters);
    }
    if (node.type === 'BlockStatement') {
        return node.body.every(statement => syntheticExpression(statement, declarations, seen, localNames));
    }
    if (node.type === 'ReturnStatement') return syntheticExpression(node.argument, declarations, seen, localNames);
    if (node.type === 'CallExpression') {
        return node.callee.type === 'MemberExpression'
            && syntheticExpression(node.callee.object, declarations, seen, localNames)
            && node.arguments.every(argument => syntheticExpression(argument, declarations, seen, localNames));
    }
    return false;
}

function externallyAffected(name, callback, declarations) {
    let affected = false;
    walk(callback.body, node => {
        if (node.type !== 'CallExpression' || syntheticExpression(node.callee, declarations)) return;
        if (node.arguments.some(argument => containsIdentifier(argument, name))) affected = true;
    });
    return affected;
}

function isTestCall(node) {
    if (node?.type !== 'CallExpression') return false;
    const callee = node.callee;
    if (callee?.type === 'Identifier') return callee.name === 'test' || callee.name === 'it';
    if (callee?.type === 'MemberExpression') {
        return callee.object?.type === 'Identifier'
            && ['test', 'it'].includes(callee.object.name);
    }
    return callee?.type === 'CallExpression'
        && callee.callee?.type === 'MemberExpression'
        && callee.callee.object?.type === 'Identifier'
        && ['test', 'it'].includes(callee.callee.object.name);
}

function testCallback(node) {
    if (!isTestCall(node)) return null;
    return [...node.arguments].reverse().find(argument => (
        argument?.type === 'ArrowFunctionExpression' || argument?.type === 'FunctionExpression'
    )) || null;
}

function hasNonEmptyGuard(callback, name) {
    let guarded = false;
    walk(callback.body, node => {
        const match = expectMatcher(node);
        if (!match) return;
        if (match.matcher === 'toHaveLength'
            && match.actual?.type === 'Identifier'
            && match.actual.name === name
            && match.expected?.type === 'NumericLiteral'
            && match.expected.value > 0) guarded = true;
        if (match.matcher === 'toBeGreaterThan'
            && match.actual?.type === 'MemberExpression'
            && propertyName(match.actual) === 'length'
            && match.actual.object?.type === 'Identifier'
            && match.actual.object.name === name
            && match.expected?.type === 'NumericLiteral'
            && match.expected.value >= 0) guarded = true;
    });
    return guarded;
}

function conditionallyPushedEmptyArrays(callback) {
    const empty = new Set();
    const conditional = new Set();
    walk(callback.body, node => {
        if (node.type === 'VariableDeclarator'
            && node.id.type === 'Identifier'
            && node.init?.type === 'ArrayExpression'
            && node.init.elements.length === 0) empty.add(node.id.name);
        if (node.type !== 'IfStatement') return;
        walk(node.consequent, child => {
            if (child.type === 'CallExpression'
                && child.callee?.type === 'MemberExpression'
                && propertyName(child.callee) === 'push'
                && child.callee.object?.type === 'Identifier') {
                conditional.add(child.callee.object.name);
            }
        });
    });
    return new Set([...empty].filter(name => conditional.has(name)));
}

export function analyzeTestIntegrity({ filename = 'test.js', source }) {
    const violations = [];
    const report = (rule, node, message) => violations.push({
        rule,
        line: node?.loc?.start?.line || 1,
        message,
    });
    let ast;
    try {
        ast = parse(source, {
            sourceType: 'module',
            plugins: ['jsx', 'topLevelAwait'],
            attachComment: true,
        });
    } catch (error) {
        return [{ rule: 'parse-error', line: error.loc?.line || 1, message: error.message }];
    }

    for (const comment of ast.comments || []) {
        if (SUSPICIOUS_COMMENT_PATTERNS.some(pattern => pattern.test(comment.value))) {
            report('copied-production-logic', comment, 'Exercise an imported production seam instead of describing a copied implementation.');
        }
    }

    walk(ast, node => {
        if (filename.endsWith('/tests/frontend/support/test_setup.js')
            && node.type === 'AssignmentExpression'
            && normalizedSource(source, node.left) === 'document.body.innerHTML'
            && node.right?.type === 'TemplateLiteral') {
            report('duplicated-shell-fixture', node, 'Load the production index.html shell instead of maintaining copied application markup.');
        }
        const match = expectMatcher(node);
        if (match && ASSERTION_MATCHERS.has(match.matcher)) {
            const actual = normalizedSource(source, match.actual);
            const expected = normalizedSource(source, match.expected);
            if (actual && expected && actual === expected) {
                report('identical-expectation', node, 'The assertion compares an expression with itself.');
            }
        }
        if (node.type === 'VariableDeclarator'
            && node.id.type === 'Identifier'
            && /^(?:re|regex|pattern)$/i.test(node.id.name)
            && node.init?.type === 'RegExpLiteral') {
            report('test-local-regex', node, 'Import the production matcher or parser instead of implementing its regex in the test.');
        }
        if (filename.includes('/e2e/')
            && (node.type === 'StringLiteral' || node.type === 'TemplateElement')
            && String(node.value?.raw || node.value || '').includes('color-mix(')) {
            report('copied-style-formula', node, 'Assert the rendered semantic outcome instead of recreating a production CSS formula.');
        }

        const callback = testCallback(node);
        if (!callback) return;
        const declarations = collectDeclarations(callback);
        const conditionalArrays = conditionallyPushedEmptyArrays(callback);
        walk(callback.body, assertion => {
            const assertionMatch = expectMatcher(assertion);
            if (!assertionMatch) return;
            const actual = assertionMatch.actual;
            if (ASSERTION_MATCHERS.has(assertionMatch.matcher)
                && syntheticExpression(actual, declarations)
                && syntheticExpression(assertionMatch.expected, declarations)) {
                const roots = [];
                walk(actual, child => {
                    if (child.type === 'Identifier' && declarations.has(child.name)) roots.push(child.name);
                });
                if (!roots.some(name => externallyAffected(name, callback, declarations))) {
                    report('self-authored-subject', assertion, 'The asserted value is produced entirely inside the test; call production code and assert its observable result.');
                }
            }
            if (actual?.type === 'CallExpression'
                && actual.callee?.type === 'MemberExpression'
                && propertyName(actual.callee) === 'every'
                && actual.callee.object?.type === 'Identifier') {
                const name = actual.callee.object.name;
                if (conditionalArrays.has(name) && !hasNonEmptyGuard(callback, name)) {
                    report('vacuous-every', assertion, `Assert ${name} is non-empty before using every().`);
                }
            }
        });
    });

    return violations.filter((violation, index) => violations.findIndex(candidate => (
        candidate.rule === violation.rule && candidate.line === violation.line
    )) === index);
}

function collectTestFiles(path, result = []) {
    for (const entry of readdirSync(path)) {
        const target = resolve(path, entry);
        if (statSync(target).isDirectory()) collectTestFiles(target, result);
        else if (/\.(?:test|spec)\.js$/.test(entry)) result.push(target);
    }
    return result;
}

export function scanTestIntegrity(root = resolve('tests')) {
    const files = collectTestFiles(root);
    const sharedSetup = resolve(root, 'frontend/support/test_setup.js');
    if (statSync(sharedSetup).isFile()) files.push(sharedSetup);
    return files.flatMap(filename => analyzeTestIntegrity({
        filename,
        source: readFileSync(filename, 'utf8'),
    }).map(violation => ({ filename, ...violation })));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/test-integrity.mjs')) {
    const violations = scanTestIntegrity();
    if (violations.length) {
        for (const violation of violations) {
            console.error(`${violation.filename}:${violation.line} [${violation.rule}] ${violation.message}`);
        }
        process.exitCode = 1;
    } else {
        console.log('Test-integrity guard passed.');
    }
}
