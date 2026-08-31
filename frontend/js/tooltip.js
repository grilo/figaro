import { tooltipPosition } from './core/tooltipModel.js';

const controllers = new WeakMap();
const tooltipAttribute = 'data-ui-tooltip';
const tooltipID = 'ui-tooltip';

function supportsManagedTooltip(element) {
    return element instanceof Element
        && element.tagName !== 'IFRAME'
        && !element.hasAttribute('data-ui-tooltip-native');
}

function adoptTitle(element) {
    if (!supportsManagedTooltip(element) || !element.hasAttribute('title')) return false;
    const text = String(element.getAttribute('title') || '').trim();
    element.removeAttribute('title');
    if (text) element.setAttribute(tooltipAttribute, text);
    else element.removeAttribute(tooltipAttribute);
    return true;
}

function adoptTitlesIn(node) {
    if (!(node instanceof Element)) return;
    adoptTitle(node);
    for (const element of node.querySelectorAll('[title]')) adoptTitle(element);
}

function tooltipTarget(origin) {
    const element = origin instanceof Element ? origin : origin?.parentElement;
    if (!element) return null;
    const directTarget = element.closest(`[${tooltipAttribute}], [title]:not(iframe):not([data-ui-tooltip-native])`);
    const labelledControl = directTarget ? null : element.closest('label')?.querySelector(
        `[${tooltipAttribute}], [title]:not(iframe):not([data-ui-tooltip-native])`,
    );
    const target = directTarget || labelledControl;
    if (!target) return null;
    adoptTitle(target);
    return String(target.getAttribute(tooltipAttribute) || '').trim() ? target : null;
}

function tooltipScope(target) {
    const label = target?.closest?.('label');
    return label?.contains(target) ? label : target;
}

function explainsDisabledControl(target) {
    const scope = tooltipScope(target);
    if (!scope) return false;
    return target.matches?.(':disabled, [aria-disabled="true"]')
        || scope.matches?.(':disabled, [aria-disabled="true"]')
        || Boolean(scope.querySelector?.(':disabled, [aria-disabled="true"]'));
}

function tooltipAnchorRect(target) {
    const rect = target.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return rect;
    const label = target.closest('label');
    return label?.getBoundingClientRect() || rect;
}

function describedByTokens(element) {
    return String(element?.getAttribute?.('aria-describedby') || '').split(/\s+/).filter(Boolean);
}

export function setTooltip(element, text) {
    if (!supportsManagedTooltip(element)) return false;
    element.removeAttribute('title');
    const normalized = String(text || '').trim();
    if (normalized) element.setAttribute(tooltipAttribute, normalized);
    else element.removeAttribute(tooltipAttribute);
    return Boolean(normalized);
}

/**
 * Own every ordinary hover/focus hint through one body-level tooltip. Existing
 * title attributes are accepted as declarative input, removed before the host
 * browser can paint them, and kept synchronized for dynamically mounted UI.
 * Iframe titles remain untouched because they are accessible names, not hints.
 */
export function initTooltips({ root = document, showDelay = 420 } = {}) {
    if (controllers.has(root)) return controllers.get(root);

    const view = root.defaultView || globalThis.window;
    let tooltip = null;
    let activeTarget = null;
    let hoverTarget = null;
    let focusTarget = null;
    let suppressedTarget = null;
    let describedTarget = null;
    let showTimer = null;

    const ensureTooltip = () => {
        if (tooltip?.isConnected) return tooltip;
        tooltip = root.createElement('div');
        tooltip.id = tooltipID;
        tooltip.className = 'ui-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.hidden = true;
        (root.body || root.documentElement).appendChild(tooltip);
        return tooltip;
    };

    const unlinkDescription = target => {
        if (!target || describedTarget !== target) return;
        const tokens = describedByTokens(target).filter(token => token !== tooltipID);
        if (tokens.length) target.setAttribute('aria-describedby', tokens.join(' '));
        else target.removeAttribute('aria-describedby');
        describedTarget = null;
    };

    const cancelShow = () => {
        if (showTimer !== null) view.clearTimeout(showTimer);
        showTimer = null;
    };

    const hide = ({ suppress = false } = {}) => {
        cancelShow();
        if (suppress) suppressedTarget = activeTarget || focusTarget || hoverTarget;
        unlinkDescription(activeTarget);
        activeTarget = null;
        if (tooltip) {
            tooltip.hidden = true;
            tooltip.style.removeProperty('visibility');
            tooltip.removeAttribute('data-placement');
        }
    };

    const show = target => {
        cancelShow();
        if (!target?.isConnected || target === suppressedTarget) return false;
        const text = String(target.getAttribute(tooltipAttribute) || '').trim();
        if (!text) {
            hide();
            return false;
        }
        const anchorRect = tooltipAnchorRect(target);
        if (anchorRect.width <= 0 && anchorRect.height <= 0) return false;

        if (activeTarget && activeTarget !== target) unlinkDescription(activeTarget);
        const surface = ensureTooltip();
        surface.textContent = text;
        surface.style.visibility = 'hidden';
        surface.hidden = false;
        const position = tooltipPosition(
            anchorRect,
            surface.getBoundingClientRect(),
            { width: view.innerWidth, height: view.innerHeight },
        );
        surface.style.left = `${position.left}px`;
        surface.style.top = `${position.top}px`;
        surface.dataset.placement = position.placement;
        surface.style.removeProperty('visibility');
        activeTarget = target;

        const tokens = describedByTokens(target);
        if (!tokens.includes(tooltipID)) {
            target.setAttribute('aria-describedby', [...tokens, tooltipID].join(' '));
            describedTarget = target;
        }
        return true;
    };

    const scheduleShow = (target, delay) => {
        cancelShow();
        if (!target || target === suppressedTarget) return;
        if (delay <= 0) {
            show(target);
            return;
        }
        showTimer = view.setTimeout(() => {
            showTimer = null;
            show(target);
        }, delay);
    };

    const onMouseOver = event => {
        const target = tooltipTarget(event.target);
        if (!target || tooltipScope(target).contains(event.relatedTarget)) return;
        if (suppressedTarget && suppressedTarget !== target) suppressedTarget = null;
        hoverTarget = target;
        scheduleShow(target, showDelay);
    };
    const onMouseOut = event => {
        const target = tooltipTarget(event.target);
        if (!target || tooltipScope(target).contains(event.relatedTarget)) return;
        if (hoverTarget === target) hoverTarget = null;
        if (suppressedTarget === target) suppressedTarget = null;
        if (focusTarget !== target) hide();
    };
    const onFocusIn = event => {
        const target = tooltipTarget(event.target);
        if (!target) return;
        if (suppressedTarget && suppressedTarget !== target) suppressedTarget = null;
        focusTarget = target;
        scheduleShow(target, 0);
    };
    const onFocusOut = event => {
        const target = tooltipTarget(event.target);
        if (!target || tooltipScope(target).contains(event.relatedTarget)) return;
        if (focusTarget === target) focusTarget = null;
        if (suppressedTarget === target) suppressedTarget = null;
        if (hoverTarget !== target) hide();
    };
    const onKeyDown = event => {
        if (event.key === 'Escape' && (activeTarget || showTimer !== null)) hide({ suppress: true });
    };
    const showDisabledExplanation = event => {
        const target = tooltipTarget(event.target);
        if (!target || !explainsDisabledControl(target)) return false;
        suppressedTarget = null;
        hoverTarget = target;
        show(target);
        return true;
    };
    const onPointerDown = event => {
        if (!showDisabledExplanation(event)) hide({ suppress: true });
    };
    const onClick = event => {
        if (!showDisabledExplanation(event)) hide({ suppress: true });
    };
    const onViewportChange = () => hide({ suppress: true });

    adoptTitlesIn(root.documentElement);
    root.addEventListener('mouseover', onMouseOver, true);
    root.addEventListener('mouseout', onMouseOut, true);
    root.addEventListener('focusin', onFocusIn, true);
    root.addEventListener('focusout', onFocusOut, true);
    root.addEventListener('keydown', onKeyDown, true);
    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('click', onClick, true);
    root.addEventListener('scroll', onViewportChange, true);
    view.addEventListener('resize', onViewportChange);
    view.addEventListener('blur', onViewportChange);

    const Observer = view.MutationObserver || globalThis.MutationObserver;
    const observer = Observer ? new Observer(records => {
        for (const record of records) {
            if (record.type === 'childList') {
                for (const node of record.addedNodes) adoptTitlesIn(node);
            } else if (record.attributeName === 'title') {
                adoptTitle(record.target);
            }
            if (record.target === activeTarget) {
                const text = String(activeTarget?.getAttribute?.(tooltipAttribute) || '').trim();
                if (text) show(activeTarget);
                else hide();
            }
        }
    }) : null;
    observer?.observe(root.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['title', tooltipAttribute],
    });

    const controller = {
        show,
        hide,
        adopt: adoptTitlesIn,
        destroy() {
            hide();
            observer?.disconnect();
            root.removeEventListener('mouseover', onMouseOver, true);
            root.removeEventListener('mouseout', onMouseOut, true);
            root.removeEventListener('focusin', onFocusIn, true);
            root.removeEventListener('focusout', onFocusOut, true);
            root.removeEventListener('keydown', onKeyDown, true);
            root.removeEventListener('pointerdown', onPointerDown, true);
            root.removeEventListener('click', onClick, true);
            root.removeEventListener('scroll', onViewportChange, true);
            view.removeEventListener('resize', onViewportChange);
            view.removeEventListener('blur', onViewportChange);
            tooltip?.remove();
            tooltip = null;
            controllers.delete(root);
        },
    };
    controllers.set(root, controller);
    return controller;
}
