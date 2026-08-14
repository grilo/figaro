import {
    findFootnoteDefinition,
    findFootnoteReference,
    getFootnoteAtPosition,
    planFootnoteDefinitionInsertion,
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

    test('plans a missing definition after the complete source paragraph', () => {
        const text = [
            'some text with a[^reference] and then',
            'some more text',
            '',
            'unrelated text here',
        ].join('\n');
        const token = getFootnoteAtPosition(text, text.indexOf('[^reference]') + 2);
        const insertion = planFootnoteDefinitionInsertion(text, token);
        const result = text.slice(0, insertion.insertAt)
            + insertion.insert
            + text.slice(insertion.insertAt);

        expect(result).toBe([
            'some text with a[^reference] and then',
            'some more text',
            '',
            '[^reference]: ',
            '',
            'unrelated text here',
        ].join('\n'));
        expect(insertion.target).toBe(result.indexOf('[^reference]: ') + '[^reference]: '.length);
        expect(resolveFootnoteNavigation(text, token.from + 2)).toEqual({
            action: 'create-definition',
            label: 'reference',
            ...insertion,
        });
    });

    test('leaves a blank line after a new definition at the end of the document', () => {
        const text = 'Missing reference[^unknown].';
        const token = getFootnoteAtPosition(text, text.indexOf('[^unknown]') + 2);
        const insertion = planFootnoteDefinitionInsertion(text, token);
        const result = text.slice(0, insertion.insertAt) + insertion.insert;

        expect(result).toBe('Missing reference[^unknown].\n\n[^unknown]: \n\n');
        expect(insertion.target).toBe(result.indexOf('[^unknown]: ') + '[^unknown]: '.length);
    });
});
