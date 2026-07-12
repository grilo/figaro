import {
    findFootnoteDefinition,
    findFootnoteReference,
    getFootnoteAtPosition,
    resolveFootnoteNavigation,
} from '../frontend/js/footnotes.js';

describe('footnote navigation', () => {
    const source = [
        'A reference[^likethis] appears here.',
        '',
        'A second reference[^likethis] is also valid.',
        '',
        '[^likethis]: The definition lives here.',
    ].join('\n');

    test('identifies references and definitions separately', () => {
        const referencePosition = source.indexOf('[^likethis]') + 3;
        const definitionPosition = source.lastIndexOf('[^likethis]') + 3;

        expect(getFootnoteAtPosition(source, referencePosition)).toMatchObject({
            label: 'likethis',
            isDefinition: false,
        });
        expect(getFootnoteAtPosition(source, definitionPosition)).toMatchObject({
            label: 'likethis',
            isDefinition: true,
        });
    });

    test('jumps from a reference to its definition', () => {
        const referencePosition = source.indexOf('[^likethis]') + 2;
        const target = findFootnoteDefinition(source, 'likethis');
        const navigation = resolveFootnoteNavigation(source, referencePosition);

        expect(navigation).toEqual({
            action: 'definition',
            label: 'likethis',
            target,
            returnPosition: source.indexOf('[^likethis]'),
        });
    });

    test('returns to the same reference when the definition is clicked', () => {
        const secondReference = source.indexOf('[^likethis]', source.indexOf('[^likethis]') + 1);
        const definitionPosition = source.lastIndexOf('[^likethis]') + 2;
        const navigation = resolveFootnoteNavigation(source, definitionPosition, secondReference);

        expect(navigation).toEqual({
            action: 'return',
            label: 'likethis',
            target: secondReference,
        });
        expect(findFootnoteReference(source, 'likethis', secondReference)).toBe(secondReference);
    });

    test('reports a missing definition instead of navigating to an unrelated note', () => {
        const text = 'Missing reference[^unknown].';
        expect(resolveFootnoteNavigation(text, text.indexOf('[^unknown]') + 2)).toEqual({
            action: 'missing-definition',
            label: 'unknown',
        });
    });
});
