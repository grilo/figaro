import { bulletMarkerForListDepth } from '../frontend/js/editor.js';

describe('Markdown bullet hierarchy', () => {
    test('starts at a filled bullet and cycles predictably for deeper nesting', () => {
        expect([1, 2, 3, 4, 5].map(bulletMarkerForListDepth)).toEqual([
            '•', '◦', '▪', '•', '◦',
        ]);
    });
});
