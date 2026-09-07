import { synchronizeEditorBlockActionLayout } from '../frontend/js/editorBlockActionLayout.js';

test.each([12, 24])('reserved helper space remains stable with %ipx base padding and clears when the rail is removed', padding => {
    const dom = document.createElement('div');
    const contentDOM = document.createElement('div');
    const scrollDOM = document.createElement('div');
    const rail = document.createElement('div');
    rail.className = 'cm-editorHelperRail-before';
    scrollDOM.append(rail, contentDOM);
    dom.append(scrollDOM);
    document.body.append(dom);
    dom.getBoundingClientRect = () => ({ left: 300, width: 500 });
    contentDOM.getBoundingClientRect = () => ({ left: 309 });
    rail.getBoundingClientRect = () => ({ right: 330, width: 120 });
    contentDOM.style.paddingLeft = `${padding}px`;
    const view = { dom, contentDOM, scrollDOM };
    synchronizeEditorBlockActionLayout(view);
    expect(dom.style.getPropertyValue('--editor-block-writing-inset')).toBe(`${117 - padding}px`);
    expect(dom.style.getPropertyValue('--editor-block-before-rail-offset')).toBe('90px');

    // The browser has applied the reserved padding and rail translation.
    contentDOM.style.paddingLeft = '117px';
    rail.style.transform = 'matrix(1, 0, 0, 1, 90, 0)';
    rail.getBoundingClientRect = () => ({ right: 420, width: 120 });
    synchronizeEditorBlockActionLayout(view);
    expect(dom.style.getPropertyValue('--editor-block-writing-inset')).toBe(`${117 - padding}px`);
    expect(dom.style.getPropertyValue('--editor-block-before-rail-offset')).toBe('90px');
    rail.remove();
    synchronizeEditorBlockActionLayout(view);
    expect(dom.style.getPropertyValue('--editor-block-writing-inset')).toBe('0px');
    dom.remove();
});
