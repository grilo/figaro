import { mountFloatingMenu } from '../../../frontend/js/floatingMenu.js';

describe('floating help scroll measurements', () => {
    let anchor, menu, placement;
    beforeEach(() => {
        document.body.innerHTML = '<section><button>About a lens</button><div><p>Help content</p></div></section>';
        anchor = document.querySelector('button'); menu = anchor.nextElementSibling;
        anchor.getBoundingClientRect = jest.fn(() => ({ top: 40, bottom: 68, left: 600, right: 628, width: 28 }));
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
        // Model a border-box help surface with two border pixels and a native
        // 15px scrollbar. Inner scroll metrics alone must never become its width.
        const width = () => parseFloat(menu.style.width) || 360;
        menu.getBoundingClientRect = () => ({ width: width() });
        Object.defineProperties(menu, {
            offsetWidth: { get: width },
            clientWidth: { get: () => width() - 17 },
            scrollWidth: { get: () => width() - 17 },
            offsetHeight: { get: () => 400 },
            clientHeight: { get: () => 398 },
            scrollHeight: { get: () => 700 },
        });
        placement = mountFloatingMenu(anchor, menu, { maximumWidth: 360, maximumHeight: 740, preferredPlacement: 'left' });
    });
    afterEach(() => placement.close());

    test('repeated help and nested-content scrolling skips placement without changing box size', () => {
        const initial = menu.style.cssText;
        anchor.getBoundingClientRect.mockClear();
        for (let step = 0; step < 8; step += 1) {
            menu.scrollTop = step % 2 ? 0 : 300;
            (step % 2 ? menu : menu.firstElementChild).dispatchEvent(new Event('scroll'));
        }
        expect(menu.style.cssText).toBe(initial);
        expect(anchor.getBoundingClientRect).not.toHaveBeenCalled();
    });

    test('external scroll, resize and content repositioning preserve border-box width and include borders in full height', () => {
        expect(menu.style.width).toBe('360px');
        expect(menu.style.maxHeight).toBe('702px');
        const initial = menu.style.cssText;
        for (let step = 0; step < 8; step += 1) {
            anchor.parentElement.dispatchEvent(new Event('scroll'));
            window.dispatchEvent(new Event('scroll'));
            window.dispatchEvent(new Event('resize'));
            placement.position();
            expect(menu.style.cssText).toBe(initial);
        }
        anchor.getBoundingClientRect.mockReturnValue({ top: 100, bottom: 128, left: 560, right: 588, width: 28 });
        anchor.parentElement.dispatchEvent(new Event('scroll'));
        expect(menu.style.left).toBe('194px');
        expect(menu.style.width).toBe('360px');
        placement.close();
        const calls = anchor.getBoundingClientRect.mock.calls.length;
        window.dispatchEvent(new Event('resize'));
        expect(anchor.getBoundingClientRect).toHaveBeenCalledTimes(calls);
        expect(menu.parentElement).toBe(anchor.parentElement);
        expect(menu.style.cssText).toBe('');
    });
});
