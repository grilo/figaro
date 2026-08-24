// Derived from babel-preset-current-node-syntax 1.2.0 under the MIT license.
function works(test) {
    try {
        // Wrap the test in a function to only test the syntax, without executing it.
        (0, eval)(`(() => { ${test} })`);
        return true;
    } catch (_error) {
        return false;
    }
}

function getPluginsList(tests) {
    const plugins = [];
    for (const [name, cases] of Object.entries(tests)) {
        if (cases.some(works)) {
            plugins.push(require.resolve(`@babel/plugin-syntax-${name}`));
        }
    }
    return plugins;
}

const babel7OnlyPlugins = getPluginsList({
    'object-rest-spread': ['({ ...{} })', '({ ...x } = {})'],
    'async-generators': ['async function* f() {}'],
    'optional-catch-binding': ['try {} catch {}'],
    'json-strings': ["'\\u2028'"],
    bigint: ['1n'],
    'optional-chaining': ['a?.b'],
    'nullish-coalescing-operator': ['a ?? b'],
    'numeric-separator': ['1_2'],
    'logical-assignment-operators': ['a ||= b', 'a &&= b', 'a ??= c'],
    'class-properties': [
        '(class { x = 1 })',
        '(class { #x = 1 })',
        '(class { #x() {} })',
    ],
    'private-property-in-object': ['(class { #x; m() { #x in y } })'],
    'class-static-block': ['(class { static {} })'],
});

const commonPlugins = getPluginsList({});
const major = Number.parseInt(process.versions.node, 10);
const minor = Number.parseInt(process.versions.node.match(/^\d+\.(\d+)/)[1], 10);

if (major > 10 || (major === 10 && minor >= 4)) {
    babel7OnlyPlugins.push(require.resolve('@babel/plugin-syntax-import-meta'));
}
if (major > 14 || (major === 14 && minor >= 3)) {
    babel7OnlyPlugins.push(require.resolve('@babel/plugin-syntax-top-level-await'));
}
if (
    major > 20
    || (major === 20 && minor >= 10)
    || (major === 18 && minor >= 20)
) {
    babel7OnlyPlugins.push(require.resolve('@babel/plugin-syntax-import-attributes'));
}

module.exports = ({ version }) => ({
    plugins: version.startsWith('7.')
        ? babel7OnlyPlugins.concat(commonPlugins)
        : commonPlugins,
});
