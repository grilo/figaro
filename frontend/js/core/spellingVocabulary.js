/** Reviewed English technical vocabulary supplements the bundled small dictionary.
 * Recognition only: these entries do not authorize replacements or infer identity.
 */
export const spellingVocabularyVersion = '1';
const technicalWords = new Set([
    'anonymized', 'api', 'apis', 'bigint', 'citable', 'conda', 'containerized', 'dependences', 'destructuring', 'doi', 'dois',
    'docstring', 'docstrings', 'dropdown', 'dropdowns', 'encodings', 'figshare',
    'filetype', 'filetypes', 'formatter', 'formatters', 'generalizable', 'hashbang', 'http', 'https', 'json',
    'initializer', 'initializers', 'interpretability', 'ipywidgets', 'iterable',
    'iterables', 'jupyter', 'makefile', 'modularize', 'nbdime', 'nbviewer',
    'noncomputational', 'noninteractive', 'papermill', 'pipelining', 'preformatted',
    'preprint', 'preprints', 'radix', 'repurposing', 'reproducibility', 'reraised',
    'runtimes', 'samtools', 'circos', 'subclass', 'subclasses', 'syntaxes',
    'traceback', 'tracebacks', 'unhandled', 'whitespace', 'xml', 'yaml', 'zenodo',
]);

export function reviewedSpellingWord(word, languages) {
    if (!languages.some(language => ['en-US', 'en-GB'].includes(language))) return false;
    // Plural acronyms retain the existing all-capitals spelling exemption.
    return /^[A-Z]{2,}s(?:['’])?$/u.test(word) || technicalWords.has(word.toLowerCase());
}
