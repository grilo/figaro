import {
    getFileLanguage,
    isCodeFilePath,
    isEditableCodeMirrorFile,
    isMarkdownFilePath,
    loadLanguageSupport,
} from '../frontend/js/languageSupport.js';
import { languages } from '@codemirror/language-data';

describe('CodeMirror file language registry', () => {
    test('recognises CSS as an editable source file', () => {
        expect(getFileLanguage('themes/_print.css')).toMatchObject({
            kind: 'code',
            label: 'CSS',
        });
        expect(isCodeFilePath('themes/_print.css')).toBe(true);
        expect(isEditableCodeMirrorFile('themes/_print.css')).toBe(true);
    });

    test('recognises filename-based and legacy CodeMirror modes', () => {
        expect(getFileLanguage('Dockerfile')).toMatchObject({
            kind: 'code',
            label: 'Dockerfile',
        });
        expect(getFileLanguage('scripts/deploy.sh')).toMatchObject({
            kind: 'code',
            label: 'Shell',
        });
    });

    test('keeps Markdown on the live-preview editor path', () => {
        expect(getFileLanguage('note.markdown')).toMatchObject({ kind: 'markdown', label: 'Markdown' });
        expect(isMarkdownFilePath('note.markdown')).toBe(true);
        expect(isCodeFilePath('note.markdown')).toBe(false);
    });

    test('does not advertise binary asset types as editable code', () => {
        expect(getFileLanguage('attachments/photo.png')).toMatchObject({ kind: 'plain' });
        expect(isEditableCodeMirrorFile('attachments/photo.png')).toBe(false);
    });

    test('lazily loads both modern and legacy language support', async () => {
        const css = await loadLanguageSupport('themes/_print.css');
        const shell = await loadLanguageSupport('scripts/deploy.sh');

        expect(css).toBeTruthy();
        expect(shell).toBeTruthy();
    });

    test('keeps every registered CodeMirror parser available in the local bundle', async () => {
        const supports = await Promise.all(languages.map(description => description.load()));
        expect(supports).toHaveLength(languages.length);
        expect(supports.every(Boolean)).toBe(true);
    });
});
