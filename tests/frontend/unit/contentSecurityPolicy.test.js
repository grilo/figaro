import fs from 'node:fs';
import path from 'node:path';

// The main window's policy is what guarantees Figaro never contacts the
// internet on its own (docs/PROMPT.md, "No external content").
function mainWindowPolicy() {
    const index = fs.readFileSync(path.resolve('frontend/index.html'), 'utf8');
    const head = index.slice(0, index.indexOf('<script'));
    const match = head.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    expect(match).not.toBeNull();
    return new Map(match[1].split(';').map(part => part.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]));
}

describe('main window content security policy', () => {
    test('is declared before any script runs and restricts every kind of load', () => {
        const policy = mainWindowPolicy();
        for (const directive of ['default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'media-src', 'connect-src', 'worker-src', 'frame-src']) {
            expect(policy.get(directive)).toEqual(expect.arrayContaining(["'self'", 'wails:', 'http://wails.localhost']));
        }
        expect(policy.get('object-src')).toEqual(["'none'"]);
        expect(policy.get('base-uri')).toEqual(["'self'"]);
        expect(policy.get('form-action')).toEqual(["'none'"]);
    });

    test('names no outside host except the Draw.io editor frame', () => {
        const allowed = new Set(["'self'", 'wails:', 'http://wails.localhost', 'data:', 'blob:', "'unsafe-inline'", "'unsafe-eval'", "'none'"]);
        for (const [directive, sources] of mainWindowPolicy()) {
            for (const source of sources) {
                if (directive === 'frame-src' && source === 'https://embed.diagrams.net') continue;
                expect({ directive, source, allowed: allowed.has(source) }).toEqual({ directive, source, allowed: true });
            }
        }
        // Only the Draw.io frame may show an outside page, and nothing may
        // fetch, load an image or connect anywhere but the application.
        expect(mainWindowPolicy().get('img-src')).not.toContain('https:');
    });
});
