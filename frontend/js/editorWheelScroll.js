import { ViewPlugin } from '@codemirror/view';
import { smoothWheelDelta, usesNativeAppleScrolling } from './core/wheelScrollModel.js';
import { createWheelScroll } from './usecases/wheelScroll.js';

const platformName = () => navigator.userAgentData?.platform || navigator.platform || '';

function hasNestedScroller(target, scroller) {
    for (let element = target instanceof Element ? target : target?.parentElement;
        element && element !== scroller; element = element.parentElement) {
        if (element.matches('input, textarea, select')) return true;
        if (element.scrollHeight > element.clientHeight + 1
            && /^(auto|scroll)$/.test(getComputedStyle(element).overflowY)) return true;
    }
    return false;
}

/** Editor-only wheel adapter. Never modifies native Apple wheel events. */
export function createEditorWheelScroll({ enabled, subscribeEnabled, platform = platformName } = {}) {
    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.view = view;
            this.motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
            const scroller = view.scrollDOM;
            this.controller = createWheelScroll({
                read: () => ({ offset: scroller.scrollTop, maximum: Math.max(0, scroller.scrollHeight - scroller.clientHeight), pageHeight: scroller.clientHeight }),
                write: value => { scroller.scrollTop = value; },
                requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
                now: () => performance.now(),
            });
            this.cancel = () => this.controller.cancel();
            this.wheel = event => {
                const delta = smoothWheelDelta({ enabled: enabled?.(), platform: platform(), reducedMotion: this.motion?.matches,
                    deltaY: event.deltaY, deltaX: event.deltaX, deltaMode: event.deltaMode,
                    ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey,
                    defaultPrevented: event.defaultPrevented, cancelable: event.cancelable,
                    lineHeight: view.defaultLineHeight, pageHeight: scroller.clientHeight });
                if (delta === null || hasNestedScroller(event.target, scroller)) { this.cancel(); return; }
                if (this.controller.scroll(delta)) event.preventDefault();
            };
            scroller.addEventListener('wheel', this.wheel, { passive: false });
            for (const type of ['keydown', 'pointerdown', 'mousedown', 'touchstart']) view.dom.addEventListener(type, this.cancel, true);
            window.addEventListener('blur', this.cancel);
            document.addEventListener('visibilitychange', this.cancel);
            this.motion?.addEventListener?.('change', this.cancel);
            this.unsubscribe = subscribeEnabled?.(this.cancel);
            this.resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.cancel);
            this.resize?.observe(scroller);
        }
        update(update) {
            if (update.docChanged || update.selectionSet) this.cancel();
        }
        destroy() {
            this.cancel();
            this.view.scrollDOM.removeEventListener('wheel', this.wheel);
            for (const type of ['keydown', 'pointerdown', 'mousedown', 'touchstart']) this.view.dom.removeEventListener(type, this.cancel, true);
            window.removeEventListener('blur', this.cancel);
            document.removeEventListener('visibilitychange', this.cancel);
            this.motion?.removeEventListener?.('change', this.cancel);
            this.resize?.disconnect();
            this.unsubscribe?.();
        }
    });
}

/** Bind the existing Settings toggle primitive to this machine's preference. */
export function initWheelScrollSettings(root, { enabled, setEnabled, platform = platformName } = {}) {
    const toggle = root.querySelector('#smooth-wheel-scroll-toggle');
    if (!toggle) return;
    const native = usesNativeAppleScrolling(platform());
    toggle.checked = !native && Boolean(enabled());
    toggle.disabled = native;
    toggle.addEventListener('change', () => setEnabled(toggle.checked));
}
