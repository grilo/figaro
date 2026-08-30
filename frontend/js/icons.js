/**
 * Shared SVG Icon Library
 * All icons in one place — change here, updates everywhere.
 * Each icon is a function(size, strokeWidth) returning an SVG string.
 * Default size: 16, default strokeWidth: 2
 */

const svg = (size, viewBox, strokeWidth, inner) =>
    `<svg width="${size}" height="${size}" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}">${inner}</svg>`;

const s = (size, sw, inner) => svg(size, '0 0 24 24', sw, inner);

// ── File & Folder ──

export const fileIcon = (size = 16, sw = 1.5) => s(size, sw,
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>');

export const folderIcon = (size = 16, sw = 1.5) => s(size, sw,
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>');

export const settingsIcon = (size = 16, sw = 2) => s(size, sw,
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>');

export const calendarIcon = (size = 16, sw = 2) => s(size, sw,
    '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>' +
    '<line x1="16" y1="2" x2="16" y2="6"/>' +
    '<line x1="8" y1="2" x2="8" y2="6"/>' +
    '<line x1="3" y1="10" x2="21" y2="10"/>');

export const kanbanIcon = (size = 16, sw = 2) => s(size, sw,
    '<rect x="3" y="3" width="7" height="7" rx="1"/>' +
    '<rect x="14" y="3" width="7" height="7" rx="1"/>' +
    '<rect x="3" y="14" width="7" height="7" rx="1"/>' +
    '<rect x="14" y="14" width="7" height="7" rx="1"/>');

export const backlinksIcon = (size = 16, sw = 2) => s(size, sw,
    '<path d="M17 7h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4"/>' +
    '<path d="M3 17h4a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H3"/>' +
    '<line x1="12" y1="12" x2="17" y2="17"/>');

export const graphIcon = (size = 16, sw = 2) => s(size, sw,
    '<circle cx="6" cy="6" r="2"/>' +
    '<circle cx="18" cy="5" r="2"/>' +
    '<circle cx="12" cy="18" r="2"/>' +
    '<path d="m7.7 7.1 3.2 8.2M16.4 6.3l-3.2 9.6M8 6h8"/>');

// ── Misc ──

export const warningIcon = (size = 14, sw = 2) => s(size, sw,
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/>' +
    '<line x1="12" y1="17" x2="12.01" y2="17"/>');
