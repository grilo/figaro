import { smoothWheelDelta, wheelScrollTarget, wheelScrollStep } from '../../../frontend/js/core/wheelScrollModel.js';
import { createWheelScroll } from '../../../frontend/js/usecases/wheelScroll.js';
import { createEditorWheelScroll, initWheelScrollSettings } from '../../../frontend/js/editorWheelScroll.js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

const wheel = { enabled: true, platform: 'Win32', deltaY: 120, lineHeight: 20, pageHeight: 600 };
test('wheel policy preserves native Apple, disabled, reduced-motion, precision, horizontal and modified gestures', () => {
    expect(smoothWheelDelta(wheel)).toBe(120);
    for (const override of [{ enabled: false }, { platform: 'MacIntel' }, { platform: 'macOS' }, { platform: 'iPad' },
        { reducedMotion: true }, { deltaY: 12 }, { deltaY: 50.5 }, { deltaX: 10 }, { ctrlKey: true },
        { metaKey: true }, { shiftKey: true }, { altKey: true }, { cancelable: false }, { defaultPrevented: true }]) {
        expect(smoothWheelDelta({ ...wheel, ...override })).toBeNull();
    }
    expect(smoothWheelDelta({ ...wheel, deltaMode: 1, deltaY: -3 })).toBe(-60);
    expect(smoothWheelDelta({ ...wheel, deltaMode: 2, deltaY: 3 })).toBe(600);
    expect(wheelScrollTarget({ offset: 100, target: 300, delta: -50, maximum: 1000, pageHeight: 600 })).toBe(50);
    expect(wheelScrollTarget({ offset: 950, delta: 120, maximum: 1000, pageHeight: 600 })).toBe(1000);
    expect(wheelScrollStep(100, 200, 16)).toBeGreaterThan(100);
    expect(wheelScrollStep(100, 200, 16)).toBeLessThan(200);
});

function harness(round = value => value) {
    let offset = 100, maximum = 1000, time = 0, id = 0;
    const frames = new Map(), write = jest.fn(value => { offset = round(value); });
    const controller = createWheelScroll({ read: () => ({ offset, maximum, pageHeight: 400 }), write,
        now: () => time, requestFrame: callback => { frames.set(++id, callback); return id; }, cancelFrame: key => frames.delete(key) });
    return { controller, frames, write, get offset() { return offset; }, set offset(value) { offset = value; },
        set maximum(value) { maximum = value; },
        frame(delta = 16) { time += delta; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)); },
        settle() { for (let i = 0; i < 150 && frames.size; i++) this.frame(8); expect(frames.size).toBe(0); } };
}
test.each([value => value, Math.floor])('animation coalesces, converges with fractional or rounded native offsets and reverses immediately', round => {
    const h = harness(round);
    expect(h.controller.scroll(120)).toBe(true);
    expect(h.offset).toBeGreaterThan(100); expect(h.offset).toBeLessThan(220);
    h.controller.scroll(120); expect(h.frames.size).toBe(1); h.settle(); expect(h.offset).toBe(340);
    h.controller.scroll(120); const before = h.offset;
    h.controller.scroll(-60); h.frame(); expect(h.offset).toBeLessThan(before); h.settle();
    expect(h.offset).toBeCloseTo(before - 60, 0);
});
test('cancel, native scroll ownership, shrinking bounds and document ends stop pending animation', () => {
    const h = harness(); h.controller.scroll(120); h.controller.cancel();
    const stopped = h.offset; h.frame(); expect(h.offset).toBe(stopped);
    h.controller.scroll(120); h.offset = 700; h.frame(); expect(h.offset).toBe(700); expect(h.frames.size).toBe(0);
    h.controller.scroll(120); h.maximum = 720; h.settle(); expect(h.offset).toBe(720);
    expect(h.controller.scroll(120)).toBe(false);
});
test.each(['Win32', 'MacIntel'])('Settings uses an opt-in toggle and protects native scrolling on %s', platform => {
    const root = document.createElement('div'); root.innerHTML = '<input id="smooth-wheel-scroll-toggle" type="checkbox">';
    document.body.append(root);
    const save = jest.fn();
    initWheelScrollSettings(root, { enabled: () => platform === 'MacIntel', setEnabled: save, platform: () => platform });
    const toggle = root.firstChild; expect(toggle.checked).toBe(false);
    expect(toggle.disabled).toBe(platform === 'MacIntel'); toggle.click();
    expect(save.mock.calls).toEqual(platform === 'MacIntel' ? [] : [[true]]); root.remove();
});
test('real editor adapter leaves Apple events untouched and stops smoothing on keyboard, preference and source changes', () => {
    let platform = 'MacIntel', notify;
    const cancelled = jest.spyOn(window, 'cancelAnimationFrame');
    const view = new EditorView({ parent: document.body, state: EditorState.create({ doc: 'Text', extensions:
        createEditorWheelScroll({ enabled: () => true, platform: () => platform, subscribeEnabled: fn => { notify = fn; return jest.fn(); } }) }) });
    Object.defineProperties(view.scrollDOM, { scrollHeight: { value: 2000 }, clientHeight: { value: 400 } });
    view.scrollDOM.scrollTop = 100;
    const dispatch = () => { const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }); view.contentDOM.dispatchEvent(event); return event; };
    try {
        expect(dispatch().defaultPrevented).toBe(false); expect(view.scrollDOM.scrollTop).toBe(100);
        platform = 'Win32'; expect(dispatch().defaultPrevented).toBe(true); expect(view.scrollDOM.scrollTop).toBeGreaterThan(100);
        for (const interrupt of [
            () => view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
            () => view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
            () => notify(),
            () => view.dispatch({ selection: { anchor: 2 } }),
            () => view.dispatch({ changes: { from: 0, insert: 'New ' } }),
        ]) {
            dispatch(); cancelled.mockClear(); interrupt(); expect(cancelled).toHaveBeenCalled();
        }
        expect(view.state.doc.toString()).toBe('New Text');
    } finally { view.destroy(); cancelled.mockRestore(); }
});
