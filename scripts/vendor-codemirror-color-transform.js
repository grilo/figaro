const babelHelperImport = 'import _objectWithoutPropertiesLoose from "@babel/runtime/helpers/objectWithoutPropertiesLoose";';

const localHelper = `function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null) return {};
  const target = {};
  for (const key of Object.keys(source)) {
    if (!excluded.includes(key)) target[key] = source[key];
  }
  return target;
}`;

/**
 * The upstream ESM artifact imports one Babel helper without declaring the
 * runtime as a package dependency. Inline that small helper before bundling so
 * Figaro's generated browser asset remains complete and deterministic.
 */
export function inlineColorExtensionBabelHelper(source) {
    const occurrences = source.split(babelHelperImport).length - 1;
    if (occurrences !== 1) {
        throw new Error(
            `Unable to inline the color-extension Babel helper: expected one upstream match, found ${occurrences}`,
        );
    }
    return source.replace(babelHelperImport, localHelper);
}
