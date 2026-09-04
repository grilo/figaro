import { analyzeTestIntegrity } from '../../../scripts/test-integrity.mjs';
import { testUtils } from '../support/test_setup.js';

describe('test-integrity guard', () => {
    test('rejects tautologies, local implementations, and copied browser style formulas', () => {
        const source = `
            test('bad', () => {
                const pattern = /hello/;
                const result = 'hello'.match(pattern);
                expect(result).toBe(result);
                expect(true).toBe(true);
                const style = 'color-mix(in srgb, red 50%, blue)';
                expect(style).toContain('red');
            });
        `;

        expect(analyzeTestIntegrity({ filename: '/repo/tests/e2e/bad.spec.js', source })
            .map(violation => violation.rule)).toEqual(expect.arrayContaining([
            'identical-expectation',
            'self-authored-subject',
            'test-local-regex',
            'copied-style-formula',
        ]));
    });

    test('rejects conditionally empty every assertions and copied-logic comments', () => {
        const source = `
            test('bad samples', () => {
                const samples = [];
                if (document.body) samples.push({ stable: true });
                // Replicate the core logic here.
                expect(samples.every(sample => sample.stable)).toBe(true);
            });
        `;

        expect(analyzeTestIntegrity({ filename: '/repo/tests/e2e/bad.spec.js', source })
            .map(violation => violation.rule)).toEqual(expect.arrayContaining([
            'copied-production-logic',
            'vacuous-every',
        ]));
    });

    test('rejects a copied application shell in the shared component fixture', () => {
        const source = 'function createMockDOM() { document.body.innerHTML = `<main id="app"></main>`; }';

        expect(analyzeTestIntegrity({
            filename: '/repo/tests/frontend/support/test_setup.js',
            source,
        }).map(violation => violation.rule)).toContain('duplicated-shell-fixture');
    });

    test('allows assertions over imported production results and guarded samples', () => {
        const source = `
            import { renderFeature } from '../feature.js';
            test('good', () => {
                const samples = [];
                if (document.body) samples.push(renderFeature());
                expect(samples).toHaveLength(1);
                expect(samples.every(sample => sample.stable)).toBe(true);
            });
        `;

        expect(analyzeTestIntegrity({ filename: '/repo/tests/e2e/good.spec.js', source }))
            .toEqual([]);
    });

    test('marks shared native effects unconfigured until a test supplies their contract', () => {
        const app = testUtils.createNativeAppMock();

        expect(app.SaveFile._figaroNativeEffect).toBe('SaveFile');
        expect(app.SaveFile._figaroNativeEffectConfigured).toBe(false);
        expect(() => app.SaveFile('draft.md', 'body')).toThrow(
            'Native test effect must be configured explicitly before use: SaveFile',
        );
        app.SaveFile.mockResolvedValue({ success: true, mtime: 7 });
        expect(app.SaveFile._figaroNativeEffectConfigured).toBe(true);
        expect(app.ReadFile._figaroNativeEffect).toBeUndefined();
    });
});
