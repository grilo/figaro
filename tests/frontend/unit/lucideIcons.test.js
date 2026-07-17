import { lucideIconLabel, lucideIconNames, renderLucideIcon, searchLucideIcons } from '../frontend/js/lucideIcons.js';

describe('Lucide icon catalog', () => {
    beforeEach(() => {
        window.lucide = {
            icons: {
                FolderHeart: [['path', { d: 'M2 4h8l2 3h10v13H2z', onclick: 'alert(1)' }]],
                Star: [['polygon', { points: '12 2 15 9 22 9 17 14' }]],
                unsafe_name: [['script', { src: 'bad.js' }]],
            },
        };
    });

    afterEach(() => {
        delete window.lucide;
    });

    test('searches valid official export names with human-readable labels', () => {
        expect(lucideIconNames()).toEqual(['FolderHeart', 'Star']);
        expect(searchLucideIcons('folder heart')).toEqual(['FolderHeart']);
        expect(lucideIconLabel('FolderHeart')).toBe('Folder Heart');
    });

    test('renders only safe SVG primitives and attributes', () => {
        const svg = renderLucideIcon('FolderHeart', { size: 20, className: 'chosen' });
        expect(svg).toContain('<svg class="chosen" width="20"');
        expect(svg).toContain('d="M2 4h8l2 3h10v13H2z"');
        expect(svg).not.toContain('onclick');
        expect(renderLucideIcon('unsafe_name')).toBe('');
        expect(renderLucideIcon('Missing')).toBe('');
    });
});
