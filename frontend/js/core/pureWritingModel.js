export const PURE_FOCUS_SCOPES = Object.freeze(['off', 'phrase', 'paragraph']);
export const PURE_TYPEWRITER_ANCHOR = 0.42;

export function normalizePureFocusScope(value) {
    return PURE_FOCUS_SCOPES.includes(value) ? value : 'off';
}

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}

function normalizedRange(range, length) {
    const from = clamp(Number(range?.from) || 0, 0, length);
    const to = clamp(Number(range?.to) || from, from, length);
    return { from, to };
}

/**
 * Resolve the source range that stays fully present while Pure focus is active.
 * CodeMirror owns Markdown structure and supplies the enclosing block; the pure
 * model only chooses between that range and injected locale-aware phrase spans.
 */
export function pureFocusRange({
    source = '',
    position = 0,
    scope = 'off',
    blockRange = null,
    phraseRanges = [],
} = {}) {
    const length = String(source).length;
    const normalizedScope = normalizePureFocusScope(scope);
    if (normalizedScope === 'off') return null;

    const block = normalizedRange(blockRange || { from: 0, to: length }, length);
    const head = clamp(Number(position) || 0, block.from, block.to);
    if (normalizedScope === 'paragraph') return block;

    const phrase = (Array.isArray(phraseRanges) ? phraseRanges : [])
        .map(range => normalizedRange(range, length))
        .find(range => range.from <= head && head <= range.to
            && range.from >= block.from && range.to <= block.to);
    return phrase || block;
}

/** Only authored text input—not pointer widgets or programmatic rewrites—moves the page. */
export function shouldRunTypewriterScroll({
    pureActive = false,
    enabled = false,
    docChanged = false,
    selectionEmpty = true,
    pointerSelecting = false,
    searchOpen = false,
    userEvents = [],
} = {}) {
    if (!pureActive || !enabled || !docChanged || !selectionEmpty
        || pointerSelecting || searchOpen) return false;

    return (Array.isArray(userEvents) ? userEvents : []).some(event => {
        const name = String(event || '');
        return name === 'input.type'
            || name.startsWith('input.type.')
            || name === 'input.paste'
            || name === 'input.complete'
            || name === 'delete.backward'
            || name === 'delete.forward';
    });
}

export function typewriterScrollTarget({
    scrollTop = 0,
    scrollHeight = 0,
    clientHeight = 0,
    caretTop = 0,
    viewportTop = 0,
    anchorRatio = PURE_TYPEWRITER_ANCHOR,
} = {}) {
    const viewportHeight = Math.max(0, Number(clientHeight) || 0);
    const maximum = Math.max(0, (Number(scrollHeight) || 0) - viewportHeight);
    const ratio = clamp(Number(anchorRatio) || PURE_TYPEWRITER_ANCHOR, 0.2, 0.8);
    const caretWithinViewport = (Number(caretTop) || 0) - (Number(viewportTop) || 0);
    const target = (Number(scrollTop) || 0) + caretWithinViewport - viewportHeight * ratio;
    return clamp(target, 0, maximum);
}

/** A short distance-aware ease keeps repeated line advances organic without queuing motion. */
export function typewriterMotionPlan({ from = 0, to = 0, reducedMotion = false } = {}) {
    const start = Math.max(0, Number(from) || 0);
    const target = Math.max(0, Number(to) || 0);
    const distance = Math.abs(target - start);
    if (reducedMotion || distance < 0.75) {
        return { from: start, to: target, duration: 0 };
    }
    return {
        from: start,
        to: target,
        duration: Math.round(clamp(112 + distance * 0.28, 120, 220)),
    };
}

const ADAPTIVE_TIERS = Object.freeze({
    compact: { scale: 0.94 },
    regular: { scale: 1 },
    spacious: { scale: 1.08 },
});

/** Three stable bands with hysteresis avoid typography flutter at resize boundaries. */
export function adaptiveTypographyPlan({
    pureActive = false,
    enabled = false,
    viewportWidth = 0,
    previousTier = 'regular',
} = {}) {
    if (!pureActive || !enabled) return { tier: 'regular', scale: 1 };

    const width = Math.max(0, Number(viewportWidth) || 0);
    const prior = ADAPTIVE_TIERS[previousTier] ? previousTier : 'regular';
    let tier = prior;

    if (prior === 'compact') {
        if (width >= 800) tier = width >= 1160 ? 'spacious' : 'regular';
    } else if (prior === 'spacious') {
        if (width <= 1080) tier = width <= 720 ? 'compact' : 'regular';
    } else if (width <= 720) {
        tier = 'compact';
    } else if (width >= 1160) {
        tier = 'spacious';
    }

    return { tier, scale: ADAPTIVE_TIERS[tier].scale };
}
