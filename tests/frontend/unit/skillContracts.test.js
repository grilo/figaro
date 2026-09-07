import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import MarkdownIt from 'markdown-it';

const skillRoot = path.resolve('.agents/skills');
const markdown = new MarkdownIt();
const read = file => fs.readFileSync(file, 'utf8');
const frontmatter = text => yaml.safeLoad(text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] || '');

function descendants(tokens) {
    return tokens.flatMap(token => [token, ...descendants(token.children || [])]);
}

function instructionsIn(folder) {
    return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) return entry.name === 'fixtures' ? [] : instructionsIn(file);
        return entry.name.endsWith('.md') ? [file] : [];
    });
}

describe('repository skill discovery and resources', () => {
    test('discovers release preparation and UX auditing with valid, unique metadata', () => {
        const folders = fs.readdirSync(skillRoot, { withFileTypes: true })
            .filter(entry => entry.isDirectory()).map(entry => entry.name);
        const names = folders.map(folder => {
            const metadata = frontmatter(read(path.join(skillRoot, folder, 'SKILL.md')));
            expect(metadata.name).toBe(folder);
            expect(metadata.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
            expect(typeof metadata.description).toBe('string');
            expect(metadata.description.trim().length).toBeGreaterThan(0);
            const interfaceFile = path.join(skillRoot, folder, 'agents/openai.yaml');
            if (fs.existsSync(interfaceFile)) {
                const { interface: ui, policy } = yaml.safeLoad(read(interfaceFile));
                expect(ui.display_name.trim().length).toBeGreaterThan(0);
                expect(ui.short_description.length).toBeGreaterThanOrEqual(25);
                expect(ui.short_description.length).toBeLessThanOrEqual(64);
                expect(ui.default_prompt).toContain(`$${metadata.name}`);
                expect(policy?.allow_implicit_invocation ?? true).toBe(true);
            }
            return metadata.name;
        });
        expect(names).toEqual(expect.arrayContaining(['prepare-figaro-release', 'pkm-markdown-editor-ux-audit']));
        expect(new Set(names).size).toBe(names.length);
    });

    test('resolves every local Markdown reference in skill instructions and templates', () => {
        for (const file of instructionsIn(skillRoot)) {
            for (const token of descendants(markdown.parse(read(file), {}))) {
                const href = token.attrGet('href') || token.attrGet('src');
                if (!href || /^(?:[a-z]+:|#)/i.test(href)) continue;
                const target = path.resolve(path.dirname(file), decodeURIComponent(href.split('#')[0]));
                expect({ file, href, exists: fs.existsSync(target) }).toEqual({ file, href, exists: true });
            }
        }
    });

    test('keeps navigation headings outside the intentionally unfinished audit fence', () => {
        const fixture = path.join(skillRoot, 'pkm-markdown-editor-ux-audit/fixtures/MARKDOWN_TORTURE_TEST.md');
        const tokens = markdown.parse(read(fixture), {});
        const headings = tokens.flatMap((token, index) => token.type === 'heading_open' ? [tokens[index + 1].content] : []);
        expect(headings).toContain('Final navigation target');
        expect(headings.some(heading => heading.startsWith('Long heading intended'))).toBe(true);
        expect(tokens.filter(token => token.type === 'fence').at(-1).content).toBe('unfinished fenced block\n');
    });

    test('bundles working note, heading, and image targets separately from missing attachments', () => {
        const fixtures = path.join(skillRoot, 'pkm-markdown-editor-ux-audit/fixtures');
        const source = read(path.join(fixtures, 'MARKDOWN_TORTURE_TEST.md'));
        const wikilinks = [...source.matchAll(/!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)];
        expect(wikilinks.length).toBeGreaterThan(0);
        for (const [, reference] of wikilinks) {
            const [name, heading] = reference.split('#');
            const file = path.join(fixtures, path.extname(name) ? name : `${name}.md`);
            expect(fs.existsSync(file)).toBe(true);
            if (heading) {
                const tokens = markdown.parse(read(file), {});
                expect(tokens.some((token, index) => token.type === 'heading_open' && tokens[index + 1].content === heading)).toBe(true);
            }
        }
        const images = descendants(markdown.parse(source, {}))
            .filter(token => token.type === 'image').map(token => token.attrGet('src'));
        expect(images).toEqual(['example-image.svg', 'missing-image.png']);
        expect(fs.existsSync(path.join(fixtures, images[0]))).toBe(true);
        expect(fs.existsSync(path.join(fixtures, images[1]))).toBe(false);
    });
});
