import { writingTerminology } from './writingTextlintModel.js';

/** Reviewed English technical and general vocabulary supplements the bundled small dictionary.
 * Recognition only: these entries do not authorize replacements or infer identity.
 */
export const spellingVocabularyVersion = '6';
const technicalWords = new Set([
    'args', 'backoff', 'backoffs', 'ctrl', 'debounce', 'debounced', 'debounces', 'debouncing',
    'fn', 'lifecycle', 'lifecycles', 'sigint', 'unref', 'whatwg',
    'async', 'backpressure', 'dotfile', 'dotfiles', 'etag', 'etags', 'fallback', 'fallbacks',
    'fallthrough', 'middleware', 'npm', 'pathname', 'pathnames',
    'anonymized', 'api', 'apis', 'bigint', 'citable', 'conda', 'containerized', 'dependences', 'destructuring', 'doi', 'dois',
    'docstring', 'docstrings', 'dropdown', 'dropdowns', 'encodings', 'figshare',
    'filetype', 'filetypes', 'formatter', 'formatters', 'generalizable', 'hashbang', 'http', 'https', 'json',
    'initializer', 'initializers', 'interpretability', 'ipywidgets', 'iterable',
    'iterables', 'jupyter', 'makefile', 'modularize', 'nbdime', 'nbviewer',
    'noncomputational', 'noninteractive', 'papermill', 'pipelining', 'plos', 'preformatted',
    'preprint', 'preprints', 'radix', 'repurposing', 'reproducibility', 'reraised',
    'runtimes', 'samtools', 'circos', 'subclass', 'subclasses', 'syntaxes',
    'traceback', 'tracebacks', 'unhandled', 'whitespace', 'xml', 'yaml', 'zenodo',
    // Replacements offered by the inclusive-language and consistency lenses.
    'allowlist', 'allowlists', 'blocklist', 'blocklists', 'ebook', 'ebooks', 'html', 'pdf', 'pdfs',
    // Keyboard and operating-system terms.
    'cmd', 'dir', 'dirs', 'esc', 'io', 'env', 'resync', 'autosave', 'autosaved', 'autosaves', 'localhost',
    // Everyday software and interface terms.
    'autocomplete', 'autocompletion', 'backend', 'backends', 'frontend', 'frontends', 'backtick', 'backticks',
    'changelog', 'changelogs', 'checkboxes', 'codebase', 'codebases', 'config', 'configs', 'dev', 'devs',
    'draggable', 'favicon', 'favicons', 'filesystem', 'filesystems', 'hardcoded', 'iframe', 'iframes',
    'linter', 'linters', 'minimap', 'minimaps', 'namespace', 'namespaces', 'preload', 'preloaded', 'preloads',
    'prepend', 'prepended', 'prepending', 'prepends', 'readme', 'repo', 'repos', 'scrollbar', 'scrollbars',
    'strikethrough', 'stylesheet', 'stylesheets', 'subfolder', 'subfolders', 'submenu', 'submenus',
    'subtree', 'subtrees', 'tooltip', 'tooltips', 'viewport', 'viewports', 'webhook', 'webhooks',
    'webpage', 'webpages',
    // Note-taking and planning terms.
    'backlink', 'backlinks', 'callout', 'callouts', 'frontmatter', 'kanban', 'kanbans', 'todo', 'todos',
    'transclude', 'transcluded', 'transclusion', 'transclusions', 'wikilink', 'wikilinks', 'zettelkasten',
]);
// Names and acronyms whose other casings remain spelling findings.
const exactWords = new Set([
    'CLI', 'CLIs', 'CSV', 'CSVs', 'Flatpak', 'GTK', 'Gantt', 'KDE', 'KaTeX', 'PKM', 'PNG', 'PNGs', 'SVG', 'SVGs',
    'UI', 'UIs', 'UTF', 'UX', 'Wayland', 'WebKit', 'WebKitGTK', 'WebView', 'iPadOS', 'macOS',
]);
// Reviewed general English words that the bundled small dictionaries omit and
// that no conservative derivation rule in spellingSuggestionsModel.js reaches.
const generalWords = new Set(['transformative']);
// Terminology fixes are exact product spellings; other casings stay flagged.
const terminologyWords = new Set(writingTerminology);

export function reviewedSpellingWord(word, languages) {
    if (!languages.some(language => ['en-US', 'en-GB'].includes(language))) return false;
    return technicalWords.has(word.toLowerCase()) || generalWords.has(word.toLowerCase()) || terminologyWords.has(word) || exactWords.has(word);
}
