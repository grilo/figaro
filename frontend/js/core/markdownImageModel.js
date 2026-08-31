export const MARKDOWN_IMAGE_MIN_WIDTH = 1;
export const MARKDOWN_IMAGE_MIN_HEIGHT = 1;
export const MARKDOWN_IMAGE_VERTICAL_LIMIT_MULTIPLIER = 10;
export const MARKDOWN_IMAGE_MAX_AUTHORED_DIMENSION = 100000;

function finitePositiveInteger(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    return Math.min(MARKDOWN_IMAGE_MAX_AUTHORED_DIMENSION, Math.max(1, Math.round(number)));
}

function clamp(value, minimum, maximum) {
    const upper = Math.max(1, Number(maximum) || 1);
    const lower = Math.min(Math.max(1, Number(minimum) || 1), upper);
    return Math.max(lower, Math.min(Number(value) || lower, upper));
}

/** Split Figaro's optional trailing `|WIDTHxHEIGHT` hint from image alt text. */
export function parseMarkdownImageAlt(value) {
    const raw = String(value ?? '');
    const match = /^(.*)\|([1-9]\d{0,5})x([1-9]\d{0,5})$/i.exec(raw);
    if (!match) return { alt: raw, width: null, height: null, sized: false };
    const width = finitePositiveInteger(match[2]);
    const height = finitePositiveInteger(match[3]);
    if (!width || !height) return { alt: raw, width: null, height: null, sized: false };
    return { alt: match[1], width, height, sized: true };
}

/** Parse the complete Markdown image forms supported by Figaro. */
export function parseMarkdownImageSyntax(text) {
    const match = String(text || '').trim()
        .match(/^!\[([^\]]*)\]\((.+?)(?:\s+["']([^"']+)["'])?\)$/);
    if (!match) return null;
    const image = parseMarkdownImageAlt(match[1]);
    return {
        alt: image.alt,
        src: match[2],
        title: match[3],
        ...(image.sized ? { width: image.width, height: image.height } : {}),
    };
}

/** Add or replace an image size hint without rebuilding its destination/title syntax. */
export function setMarkdownImageSize(source, width, height) {
    const normalizedWidth = finitePositiveInteger(width);
    const normalizedHeight = finitePositiveInteger(height);
    if (!normalizedWidth || !normalizedHeight) return String(source ?? '');
    return String(source ?? '').replace(/^!\[([^\]]*)\]/, (_match, rawAlt) => {
        const { alt } = parseMarkdownImageAlt(rawAlt);
        return `![${alt}|${normalizedWidth}x${normalizedHeight}]`;
    });
}

/** Remove only Figaro's size hint, returning the image to intrinsic dimensions. */
export function clearMarkdownImageSize(source) {
    return String(source ?? '').replace(/^!\[([^\]]*)\]/, (_match, rawAlt) => (
        `![${parseMarkdownImageAlt(rawAlt).alt}]`
    ));
}

/** Fit authored or intrinsic geometry to the writing width without enlarging it. */
export function markdownImageDisplaySize({
    width,
    height,
    originalWidth,
    originalHeight,
    availableWidth = Number.POSITIVE_INFINITY,
} = {}) {
    const requestedWidth = finitePositiveInteger(width) || finitePositiveInteger(originalWidth) || 1;
    const requestedHeight = finitePositiveInteger(height) || finitePositiveInteger(originalHeight) || 1;
    const maximumWidth = Math.max(1, Number(availableWidth) || requestedWidth);
    const scale = Math.min(1, maximumWidth / requestedWidth);
    return {
        width: Math.max(1, Math.round(requestedWidth * scale)),
        height: Math.max(1, Math.round(requestedHeight * scale)),
    };
}

/** Plan one resize gesture independently from CodeMirror, DOM, and persistence. */
export function markdownImageResizePlan({
    mode,
    startWidth,
    startHeight,
    deltaX = 0,
    deltaY = 0,
    maximumWidth = Number.POSITIVE_INFINITY,
    maximumProportionalHeight = Number.POSITIVE_INFINITY,
    originalWidth,
    originalHeight,
} = {}) {
    const width = finitePositiveInteger(startWidth) || 1;
    const height = finitePositiveInteger(startHeight) || 1;
    const intrinsicWidth = finitePositiveInteger(originalWidth) || width;
    const intrinsicHeight = finitePositiveInteger(originalHeight) || height;
    const minimumWidth = Math.min(MARKDOWN_IMAGE_MIN_WIDTH, intrinsicWidth);
    const minimumHeight = Math.min(MARKDOWN_IMAGE_MIN_HEIGHT, intrinsicHeight);
    const rightEdge = Math.max(1, Number(maximumWidth) || width);

    if (mode === 'width') {
        return {
            width: Math.round(clamp(width + Number(deltaX || 0), minimumWidth, rightEdge)),
            height,
        };
    }

    if (mode === 'height') {
        const maximumHeight = Math.max(
            minimumHeight,
            intrinsicHeight * MARKDOWN_IMAGE_VERTICAL_LIMIT_MULTIPLIER,
        );
        return {
            width,
            height: Math.round(clamp(height + Number(deltaY || 0), minimumHeight, maximumHeight)),
        };
    }

    const aspect = width / height;
    const widthFromHorizontalMotion = width + Number(deltaX || 0);
    const widthFromVerticalMotion = (height + Number(deltaY || 0)) * aspect;
    const horizontalWeight = Math.abs(Number(deltaX || 0) / width);
    const verticalWeight = Math.abs(Number(deltaY || 0) / height);
    const requestedWidth = horizontalWeight >= verticalWeight
        ? widthFromHorizontalMotion
        : widthFromVerticalMotion;
    const firstEdgeWidth = Math.min(
        rightEdge,
        Math.max(1, Number(maximumProportionalHeight) || height) * aspect,
    );
    const proportionalMinimumWidth = Math.max(minimumWidth, minimumHeight * aspect);
    const nextWidth = Math.round(clamp(requestedWidth, proportionalMinimumWidth, firstEdgeWidth));
    return {
        width: nextWidth,
        height: Math.max(1, Math.round(nextWidth / aspect)),
    };
}
