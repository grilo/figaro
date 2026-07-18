import { expect, test } from '@playwright/test';

test('shows contextual backlinks and safely links an unlinked mention in the selected link style', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.evaluate(async () => {
        const app = (await import('/js/backend.js')).backend();
        window.__relationshipLinkCalls = [];
        let unlinkedCalls = 0;
        app.SearchBacklinks = async () => [{
            path: 'linked.md', name: 'linked.md', line_num: 2,
            context: 'Before\n[Target](Target.md) is already connected.\nAfter', match_text: 'Target',
        }];
        app.SearchUnlinkedMentions = async () => {
            unlinkedCalls += 1;
            return unlinkedCalls === 1 ? [{
                path: 'mention.md', name: 'mention.md', line_num: 4,
                context: 'Target needs a decision before Friday.', match_text: 'Target',
            }] : [];
        };
        app.LinkUnlinkedMention = async (...args) => {
            window.__relationshipLinkCalls.push(args);
            return { success: true, path: 'mention.md', mtime: 2 };
        };
        const { openTab } = await import('/js/tabManager.js');
        openTab('relationships-target', 'Relationships', 'backlinks', { targetPath: 'Target.md' });
    });

    await expect(page.locator('.relationship-section')).toHaveCount(2);
    await expect(page.locator('.relationship-card')).toHaveCount(2);
    await expect(page.locator('.relationship-context').first()).toContainText('Target');
    const action = page.locator('.relationship-link-action');
    await expect(action).toBeVisible();

    const styles = await action.evaluate(element => {
        const style = getComputedStyle(element);
        return { radius: Number.parseFloat(style.borderRadius), background: style.backgroundColor, cursor: style.cursor };
    });
    expect(styles.radius).toBeGreaterThanOrEqual(4);
    expect(styles.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.cursor).toBe('pointer');

    await action.focus();
    await expect(action).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__relationshipLinkCalls)).toEqual([
        ['mention.md', 4, 'Target.md', 'markdown'],
    ]);
    await expect(page.locator('.relationship-section').nth(1)).toContainText('No unlinked mentions found');
});
