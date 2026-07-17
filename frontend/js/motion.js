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

const exitAnimations = new WeakMap();

/**
 * Play a CSS-owned exit animation and resolve when its visual work is done.
 * The timeout is a defensive fallback for hidden documents and webviews that
 * suppress animation events. Repeated close requests share the same promise.
 */
export function playExitAnimation(element, className = 'figaro-panel-exit', fallbackMs = 260) {
    if (!element) return Promise.resolve();
    if (exitAnimations.has(element)) return exitAnimations.get(element);

    const animation = new Promise(resolve => {
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            element.removeEventListener('animationend', handleAnimationEnd);
            exitAnimations.delete(element);
            resolve();
        };
        const handleAnimationEnd = event => {
            if (event.target === element) finish();
        };
        const timeout = setTimeout(finish, fallbackMs);

        element.addEventListener('animationend', handleAnimationEnd);
        element.classList.remove('figaro-panel-enter');
        void element.offsetWidth;
        element.classList.add(className);
    });
    exitAnimations.set(element, animation);
    return animation;
}
