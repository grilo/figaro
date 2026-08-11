import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import generator from '../../../scripts/generateStressVault.cjs';
import stressVault from '../../../scripts/stressVaultPlan.cjs';

const {
    buildStressVaultPlan,
    hugeDocumentContent,
    smallDocumentContent,
} = stressVault;

describe('huge-vault stress fixture', () => {
    test('plans 10,000 unique renamed copies with five 10,000-line documents', () => {
        const plan = buildStressVaultPlan();
        const paths = plan.documents.map(document => document.path);

        expect(plan.documentCount).toBe(10000);
        expect(plan.smallDocumentCount).toBe(9995);
        expect(plan.documents.filter(document => document.template === 'huge')).toHaveLength(5);
        expect(new Set(paths).size).toBe(10000);
        expect(paths.some(candidate => candidate.split('/').length >= 7)).toBe(true);
        expect(plan.documents.filter(document => document.source)).toEqual([
            { path: '2026-08-11.md', template: 'small', source: true },
            { path: 'Research/Large/Huge Source.md', template: 'huge', source: true },
        ]);
    });

    test('keeps the common marker in both templates and the rare marker at the huge tail', () => {
        const small = smallDocumentContent();
        const huge = hugeDocumentContent(10000);

        expect(small).toContain('figaro-common-scale-term');
        expect(huge).toContain('figaro-common-scale-term');
        expect(huge.trimEnd().split('\n')).toHaveLength(10000);
        expect(huge.trimEnd().split('\n').at(-1)).toContain('figaro-rare-tail-term');
    });

    test('materializes a small disposable vault by copying the two source documents', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figaro-stress-generator-'));
        try {
            const result = await generator.generateStressVault({
                output: 'vault',
                documentCount: 12,
                hugeDocumentCount: 2,
                hugeLineCount: 20,
            }, root);
            const plan = buildStressVaultPlan({
                documentCount: 12,
                hugeDocumentCount: 2,
                hugeLineCount: 20,
            });
            const markdown = plan.documents.map(document => path.join(result.output, document.path));
            const manifest = JSON.parse(fs.readFileSync(path.join(result.output, '.figaro-stress-vault.json'), 'utf8'));

            expect(markdown.every(candidate => fs.existsSync(candidate))).toBe(true);
            expect(fs.readFileSync(markdown[0], 'utf8')).toBe(fs.readFileSync(markdown.at(-1), 'utf8'));
            expect(manifest).toMatchObject({ documentCount: 12, hugeDocumentCount: 2, hugeLineCount: 20 });
            await expect(generator.generateStressVault({ output: 'vault', documentCount: 12 }, root))
                .rejects.toThrow('already exists');
            await expect(generator.generateStressVault({
                output: 'vault',
                documentCount: 12,
                hugeDocumentCount: 2,
                hugeLineCount: 20,
                replace: true,
            }, root)).resolves.toMatchObject({ documentCount: 12 });
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('never replaces an existing directory that lacks the generated-vault marker', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figaro-stress-generator-safety-'));
        const existing = path.join(root, 'personal-notes');
        try {
            fs.mkdirSync(existing);
            fs.writeFileSync(path.join(existing, 'keep.md'), 'do not remove');

            await expect(generator.generateStressVault({
                output: 'personal-notes',
                documentCount: 12,
                hugeDocumentCount: 2,
                replace: true,
            }, root)).rejects.toThrow('refusing to replace');
            expect(fs.readFileSync(path.join(existing, 'keep.md'), 'utf8')).toBe('do not remove');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('rejects unsafe output roots and impossible document mixes', () => {
        expect(() => generator.safeOutputPath('.', process.cwd())).toThrow('dedicated child directory');
        expect(() => buildStressVaultPlan({ documentCount: 5, hugeDocumentCount: 5 }))
            .toThrow('smaller than documentCount');
        expect(() => buildStressVaultPlan({ documentCount: 1 })).toThrow('leave room');
    });
});
