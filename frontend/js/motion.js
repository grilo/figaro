/**
 * Small, reusable helpers for one-shot UI entrance animations.
 *
 * CSS owns the timing and honors reduced-motion preferences. This helper only
 * restarts a named entrance class when a persistent panel becomes visible
 * again.
 */

export function playEntranceAnimation(element, className = 'figaro-panel-enter') {
    if (!element) return;

    element.classList.remove(className);
    // Force the removal to be observed before adding the class again. This is
    // only used when a user explicitly opens or revisits one of these panels.
    void element.offsetWidth;
    element.classList.add(className);
}
