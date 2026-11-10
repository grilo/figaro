/** Shared pure accent choices for appearance-backed feature policy. */
export const ACCENT_COLOR_PALETTE = [
    '', '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#22c55e', '#14b8a6', '#3b82f6', '#6366f1',
    '#a855f7', '#ec4899', '#6b7280',
];

/**
 * A color read back from a vault file, or '' when it is not one the palette
 * could have stored. Every palette entry is "#rrggbb", so nothing else is
 * allowed to reach markup or a style: the file travels with a shared vault.
 */
export function storedAccentColor(value) {
    return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : '';
}

export default ACCENT_COLOR_PALETTE;
