function decodedImagePath(source) {
    const raw = String(source || '').trim();
    if (!raw || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(raw)) return null;
    const unwrapped = raw.startsWith('<') && raw.endsWith('>')
        ? raw.slice(1, -1).trim()
        : raw;
    if (!unwrapped || /[?#\0]/.test(unwrapped)) return null;
    try {
        const decoded = decodeURIComponent(unwrapped).replace(/\\/g, '/');
        return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(decoded) ? null : decoded;
    } catch {
        return null;
    }
}

export { parseMarkdownImageSyntax } from './markdownImageModel.js';

/** Identify a standalone editable local Draw.io image without resolving a note path. */
export function isLocalDrawioMarkdownImage(source) {
    const image = parseMarkdownImageSyntax(source);
    const path = decodedImagePath(image?.src);
    return Boolean(path && /\.drawio\.svg$/i.test(path));
}

/** Resolve a local Markdown image destination to a vault-contained Draw.io file. */
export function drawioImageCreationTarget({ imageSource, notePath }) {
    const sourcePath = decodedImagePath(imageSource);
    if (!sourcePath || !/\.drawio\.svg$/i.test(sourcePath)) return null;

    const noteSegments = String(notePath || '').replace(/\\/g, '/').split('/').filter(Boolean);
    if (noteSegments.length) noteSegments.pop();
    const segments = sourcePath.startsWith('/') ? [] : noteSegments;

    for (const segment of sourcePath.split('/')) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            if (!segments.length) return null;
            segments.pop();
            continue;
        }
        if (segment === '.' || segment === '..' || segment.includes('\0')) return null;
        segments.push(segment);
    }

    const path = segments.join('/');
    if (!path || !/\.drawio\.svg$/i.test(path)) return null;
    try {
        segments.forEach(segment => encodeURIComponent(segment));
    } catch {
        return null;
    }
    return {
        path,
        title: segments.at(-1),
    };
}

/** Build the canonical browser route for an already validated vault target. */
export function drawioImageVaultURL(target, revision = null) {
    if (!target?.path) return null;
    try {
        const url = `/vault/${target.path.split('/').map(segment => encodeURIComponent(segment)).join('/')}`;
        return revision == null ? url : `${url}?figaro-preview=${encodeURIComponent(String(revision))}`;
    } catch {
        return null;
    }
}

/** Resolve a failed SVG load without conflating previewable, empty, and absent files. */
export function drawioImageStateForRead(result, error = null) {
    if (error) return { kind: 'error' };
    if (!result) return { kind: 'create' };
    const content = String(result.content || '');
    if (/<svg[\s>]/i.test(content)) {
        return {
            kind: 'preview',
            source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`,
        };
    }
    return { kind: 'open' };
}
import { parseMarkdownImageSyntax } from './markdownImageModel.js';
