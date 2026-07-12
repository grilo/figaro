/**
 * File-language detection backed by CodeMirror's official language registry.
 *
 * The registry contains both modern CM6 parsers and its maintained legacy
 * modes. Parser modules are loaded lazily, so merely showing the file tree
 * does not load every language grammar.
 */

import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

function filenameFromPath(path) {
    const normalized = String(path || '').replace(/\\/g, '/');
    return normalized.slice(normalized.lastIndexOf('/') + 1);
}

export function getLanguageDescription(path) {
    const filename = filenameFromPath(path);
    return filename ? LanguageDescription.matchFilename(languages, filename) : null;
}

export function getFileLanguage(path) {
    const description = getLanguageDescription(path);
    if (!description) {
        return { kind: 'plain', label: 'Plain Text', description: null };
    }
    if (description.name === 'Markdown') {
        return { kind: 'markdown', label: 'Markdown', description };
    }
    return { kind: 'code', label: description.name, description };
}

export function isMarkdownFilePath(path) {
    return getFileLanguage(path).kind === 'markdown';
}

export function isCodeFilePath(path) {
    return getFileLanguage(path).kind === 'code';
}

export function isEditableCodeMirrorFile(path) {
    return getFileLanguage(path).kind !== 'plain';
}

export async function loadLanguageSupport(path) {
    const language = getFileLanguage(path);
    if (language.kind !== 'code' || !language.description) return null;
    return language.description.load();
}
