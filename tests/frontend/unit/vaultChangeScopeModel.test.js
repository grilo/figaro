import { vaultChangeScope, mergeVaultChangeScopes, vaultChangeTouchesRenderedAssets, vaultChangeTouchesPath } from '../../../frontend/js/core/vaultChangeScopeModel.js';

test('backend payloads without paths are an unknown scope; listed paths are normalized', () => {
    expect(vaultChangeScope(undefined)).toBeNull();
    expect(vaultChangeScope(['Notes\\a.md', 'b.md'])).toEqual(['Notes/a.md', 'b.md']);
    expect(vaultChangeScope([])).toEqual([]);
});

test('merging coalesced batches unions paths and lets any unknown batch win', () => {
    expect(mergeVaultChangeScopes(undefined, ['a.md'])).toEqual(['a.md']);
    expect(mergeVaultChangeScopes(['a.md'], ['a.md', 'b.png'])).toEqual(['a.md', 'b.png']);
    expect(mergeVaultChangeScopes(['a.md'], null)).toBeNull();
    expect(mergeVaultChangeScopes(null, ['a.md'])).toBeNull();
    expect(mergeVaultChangeScopes(undefined, null)).toBeNull();
});

test('previews refresh only for image or diagram changes, or an unknown scope', () => {
    expect(vaultChangeTouchesRenderedAssets(['Notes/a.md', 'Notes/~$tmp.docx'])).toBe(false);
    expect(vaultChangeTouchesRenderedAssets([])).toBe(false);
    for (const path of ['img/photo.PNG', 'img/flow.drawio.svg', 'flow.drawio', 'pic.webp']) expect(vaultChangeTouchesRenderedAssets([path])).toBe(true);
    expect(vaultChangeTouchesRenderedAssets(null)).toBe(true);
    expect(vaultChangeTouchesRenderedAssets(undefined)).toBe(true);
});

test('per-note history refreshes only when that note changed, or the scope is unknown', () => {
    expect(vaultChangeTouchesPath(['Other.md'], 'Notes/a.md')).toBe(false);
    expect(vaultChangeTouchesPath(['Notes/a.md'], 'Notes/a.md')).toBe(true);
    expect(vaultChangeTouchesPath(['Notes/a.md'], '')).toBe(false);
    expect(vaultChangeTouchesPath(null, 'Notes/a.md')).toBe(true);
});

test('a renamed, moved or deleted folder counts as touching what it contained', () => {
    expect(vaultChangeTouchesRenderedAssets(['Images', 'Pictures'])).toBe(true);
    expect(vaultChangeTouchesPath(['Notes'], 'Notes/a.md')).toBe(true);
    expect(vaultChangeTouchesPath(['Notes'], 'Notebook/a.md')).toBe(false);
    expect(vaultChangeTouchesPath(['Projects/Alpha'], 'Projects/Alpha/Plan/a.md')).toBe(true);
});
