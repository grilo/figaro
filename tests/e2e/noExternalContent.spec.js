import { expect, test } from '@playwright/test';
import { openWelcomeEditor } from './support/editorWorkspace.js';

// Browser-only boundary: whether a page contacts another host is decided by
// the real network stack and the page's content security policy.
test('a note with web images loads nothing from outside the application and says why', async ({ page, baseURL }) => {
    const outside = [];
    const violations = [];
    // A request the policy refuses never reaches the network layer, so it is
    // not routed; anything routed to another host would be a real contact.
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === new URL(baseURL).origin) return route.continue();
        outside.push(url.href);
        return route.abort();
    });
    page.on('console', message => {
        if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
    });
    await openWelcomeEditor(page);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.setEditorContent([
            '# Tracking',
            '',
            '![pixel](https://ex.test/pixel.png)',
            '',
            '![relative](//ex.test/relative.png)',
            '',
            '![disk](file:///etc/hosts.png)',
            '',
            'Tail',
        ].join('\n'), 'Welcome.md');
    });

    const blocked = page.locator('.cm-image-error--outside-vault');
    await expect(blocked).toHaveCount(3);
    await expect(blocked.first()).toContainText('never loads content from the internet');
    await expect(blocked.first()).toHaveAttribute('data-ui-tooltip', 'https://ex.test/pixel.png');

    // The policy is the guarantee behind the editor's own rule: anything that
    // still asks for the web is refused by the browser, not merely unrendered.
    const attempt = await page.evaluate(async () => {
        const image = new Image();
        const loaded = new Promise(resolve => { image.onload = () => resolve('loaded'); image.onerror = () => resolve('refused'); });
        image.src = 'https://ex.test/injected.png';
        document.body.append(image);
        let fetched;
        try { await fetch('https://ex.test/beacon', { mode: 'no-cors' }); fetched = 'sent'; } catch { fetched = 'refused'; }
        image.remove();
        return { image: await loaded, fetched };
    });
    expect(attempt).toEqual({ image: 'refused', fetched: 'refused' });
    expect(outside).toEqual([]);
    expect(violations.some(text => text.includes('https://ex.test/injected.png'))).toBe(true);
    expect(violations.some(text => text.includes('https://ex.test/beacon'))).toBe(true);
});
