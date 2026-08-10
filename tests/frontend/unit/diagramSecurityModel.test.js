import {
    MAX_MERMAID_SOURCE_LENGTH,
    planMermaidSourceRender,
} from '../frontend/js/core/diagramSecurityModel.js';

describe('Mermaid pre-parse security policy', () => {
    test('allows ordinary diagrams through the existing Mermaid size ceiling', () => {
        expect(planMermaidSourceRender('flowchart TD\n  A --> B')).toEqual({
            action: 'render',
            reason: null,
            maxLength: MAX_MERMAID_SOURCE_LENGTH,
        });
        expect(planMermaidSourceRender('a'.repeat(MAX_MERMAID_SOURCE_LENGTH)).action).toBe('render');
    });

    test('preserves oversized source before Mermaid can parse its YAML frontmatter', () => {
        expect(planMermaidSourceRender('a'.repeat(MAX_MERMAID_SOURCE_LENGTH + 1))).toEqual({
            action: 'preserve-source',
            reason: 'source-too-large',
            maxLength: MAX_MERMAID_SOURCE_LENGTH,
        });
    });

    test.each([
        'config: !!omap\n- dangerous: value',
        'config: !<tag:yaml.org,2002:omap>\n- dangerous: value',
        'config: !<tag:yaml.org,2002:%6Fmap>\n- dangerous: value',
        'config: !safe!omap\n- dangerous: value',
    ])('rejects a YAML ordered-map tag in Mermaid frontmatter: %s', (frontmatter) => {
        const source = `---\n${frontmatter}\n---\nflowchart TD\n  A --> B`;

        expect(planMermaidSourceRender(source)).toEqual({
            action: 'preserve-source',
            reason: 'unsafe-yaml-ordered-map',
            maxLength: MAX_MERMAID_SOURCE_LENGTH,
        });
    });

    test('does not mistake ordinary diagram text for YAML frontmatter', () => {
        expect(planMermaidSourceRender('flowchart TD\n  A[!!omap documentation] --> B').action).toBe('render');
    });
});
