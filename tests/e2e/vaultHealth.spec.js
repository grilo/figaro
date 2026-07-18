import { expect, test } from '@playwright/test';

test('opens the themed read-only Vault health scan from Settings and navigates to a finding', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const app = (await import('/js/backend.js')).backend();
        window.__vaultHealthCalls = 0;
        app.GetVaultHealth = async () => {
            window.__vaultHealthCalls += 1;
            return {
                broken_links: [{ path: 'notes/source.md', line_num: 6, detail: 'Links to a vault entry that does not exist.', target: 'missing.md' }],
                orphan_attachments: [{ path: 'assets/orphan.png', detail: 'No Markdown note references this attachment.' }],
                duplicate_names: [],
                invalid_frontmatter: [],
            };
        };
        app.ReadFile = async path => ({ content: `# ${path}`, path, mtime: 1 });
    });

    await page.locator('#topbar-settings').click();
    const review = page.locator('#open-vault-health');
    await expect(review).toBeVisible();
    await review.click();

    await expect(page.locator('.vault-health-view h2')).toHaveText('Vault health');
    await expect(page.locator('.vault-health-summary')).toContainText('2 findings');
    await expect(page.locator('.vault-health-section')).toHaveCount(4);
    await expect(page.locator('.vault-health-open').first()).toContainText('notes/source.md:6');
    await expect.poll(() => page.evaluate(() => window.__vaultHealthCalls)).toBe(1);

    const styles = await page.locator('.vault-health-scan').evaluate(element => {
        const style = getComputedStyle(element);
        return { radius: Number.parseFloat(style.borderRadius), background: style.backgroundColor, cursor: style.cursor };
    });
    expect(styles.radius).toBeGreaterThanOrEqual(6);
    expect(styles.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.cursor).toBe('pointer');

    await page.locator('.vault-health-open').first().focus();
    await expect(page.locator('.vault-health-open').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.tab[data-tab-id="notes/source.md"]')).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('notes/source.md');
});
