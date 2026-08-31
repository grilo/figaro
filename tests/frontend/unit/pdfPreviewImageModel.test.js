import { planPDFPreviewImageSource } from '../../../frontend/js/core/pdfPreviewImageModel.js';

describe('PDF preview image source planning', () => {
    test('resolves note-relative, parent-relative, and vault-root image paths', () => {
        expect(planPDFPreviewImageSource('notes/report.md', 'portrait.png')).toEqual({
            kind: 'vault',
            path: 'notes/portrait.png',
            suffix: '',
        });
        expect(planPDFPreviewImageSource('notes/report.md', '../assets/portrait%20one.png#page')).toEqual({
            kind: 'vault',
            path: 'assets/portrait one.png',
            suffix: '#page',
        });
        expect(planPDFPreviewImageSource('notes/report.md', '/shared/portrait.png')).toEqual({
            kind: 'vault',
            path: 'shared/portrait.png',
            suffix: '',
        });
        expect(planPDFPreviewImageSource('notes/report.md', '/vault/shared/portrait.png?raw=1')).toEqual({
            kind: 'vault',
            path: 'shared/portrait.png',
            suffix: '?raw=1',
        });
    });

    test.each([
        'https://example.test/portrait.png',
        'data:image/png;base64,AA==',
        'blob:https://example.test/image-id',
        '//cdn.example.test/portrait.png',
        '../../outside.png',
        'bad%2',
    ])('preserves non-local or unsafe source %s', source => {
        expect(planPDFPreviewImageSource('notes/report.md', source)).toEqual({
            kind: 'passthrough',
            source,
        });
    });
});
