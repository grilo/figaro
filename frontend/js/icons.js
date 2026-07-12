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

// ── Chevrons ──

export const chevronRight = (size = 16, sw = 2) => s(size, sw,
    '<polyline points="9 18 15 12 9 6"/>');

export const chevronDown = (size = 16, sw = 2) => s(size, sw,
    '<polyline points="6 9 12 15 18 9"/>');

export const chevronLeft = (size = 16, sw = 2) => s(size, sw,
    '<polyline points="15 18 9 12 15 6"/>');

// ── Actions ──

export const closeIcon = (size = 16, sw = 2) => s(size, sw,
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');

export const minimizeIcon = (size = 16, sw = 2) => s(size, sw,
    '<line x1="5" y1="12" x2="19" y2="12"/>');

export const maximizeIcon = (size = 16, sw = 2) => s(size, sw,
    '<rect x="4" y="4" width="16" height="16" rx="2"/>');

export const hamburgerIcon = (size = 16, sw = 2) => s(size, sw,
    '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>');

export const searchIcon = (size = 16, sw = 2) => s(size, sw,
    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>');

export const trashIcon = (size = 16, sw = 2) => s(size, sw,
    '<polyline points="3 6 5 6 21 6"/>' +
    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');

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

export const homeIcon = (size = 16, sw = 2) => s(size, sw,
    '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>' +
    '<polyline points="9 22 9 12 15 12 15 22"/>');

export const backlinksIcon = (size = 16, sw = 2) => s(size, sw,
    '<path d="M17 7h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4"/>' +
    '<path d="M3 17h4a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H3"/>' +
    '<line x1="12" y1="12" x2="17" y2="17"/>');

// ── Editor actions ──

export const cutIcon = (size = 14, sw = 2) => s(size, sw,
    '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>' +
    '<line x1="20" y1="4" x2="8.12" y2="15.88"/>' +
    '<line x1="14.47" y1="14.48" x2="20" y2="20"/>');

export const copyIcon = (size = 14, sw = 2) => s(size, sw,
    '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>');

export const pasteIcon = (size = 14, sw = 2) => s(size, sw,
    '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
    '<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>');

export const selectAllIcon = (size = 14, sw = 2) => s(size, sw,
    '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>' +
    '<line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/>');

export const exportIcon = (size = 14, sw = 2) => s(size, sw,
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" y1="15" x2="12" y2="3"/>');

// ── Misc ──

export const pencilIcon = (size = 14, sw = 2) => s(size, sw,
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
    '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>');

export const colorPickerIcon = (size = 14, sw = 2) => s(size, sw,
    '<circle cx="12" cy="12" r="10"/>' +
    '<path d="M12 2a10 10 0 0 1 0 20"/>' +
    '<path d="M2 12h20"/>');

export const mergeIcon = (size = 14, sw = 2) => s(size, sw,
    '<polyline points="4 17 10 11 4 5"/>' +
    '<line x1="12" y1="19" x2="20" y2="19"/>');

export const warningIcon = (size = 14, sw = 2) => s(size, sw,
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/>' +
    '<line x1="12" y1="17" x2="12.01" y2="17"/>');

export const resizeGripIcon = (size = 18, sw = 1.5) => svg(size, '0 0 18 18', sw,
    '<line x1="16" y1="2" x2="2" y2="16"/>' +
    '<line x1="16" y1="8" x2="8" y2="16"/>' +
    '<line x1="16" y1="14" x2="14" y2="16"/>');
