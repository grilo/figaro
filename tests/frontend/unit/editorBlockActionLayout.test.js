import { synchronizeEditorBlockActionLayout } from '../frontend/js/editorBlockActionLayout.js';

test('reserves newly installed gutter widths before positioning rails against centered text', () => {
    const dom = document.createElement('div');
    const contentDOM = document.createElement('div');
    const scrollDOM = document.createElement('div');
    const helper = document.createElement('div');
    const activity = document.createElement('div');
    helper.className = 'cm-editorHelperRail-before';
    activity.className = 'cm-activityGutter';
    scrollDOM.append(activity, helper, contentDOM);
    dom.append(scrollDOM);
    document.body.append(dom);
    dom.getBoundingClientRect = () => ({ left: 280, width: 900 });
    helper.getBoundingClientRect = () => ({ right: 400, width: 78 });
    activity.getBoundingClientRect = () => ({ right: 360, width: 87 });
    contentDOM.style.paddingLeft = '24px';
    const measurements = [];
    contentDOM.getBoundingClientRect = () => {
        const helperWidth = dom.style.getPropertyValue('--editor-block-before-rail-width');
        const activityWidth = dom.style.getPropertyValue('--editor-activity-rail-width');
        measurements.push([helperWidth, activityWidth]);
        // Model the browser's two observed layouts: normal-flow gutters move
        // centered text; their negative margins restore its ordinary edge.
        return { left: helperWidth === '78px' && activityWidth === '87px' ? 445 : 527.5 };
    };
    try {
        synchronizeEditorBlockActionLayout({ dom, contentDOM, scrollDOM });
        expect(measurements).toEqual([['', ''], ['78px', '87px']]);
        expect(dom.style.getPropertyValue('--editor-block-before-rail-offset')).toBe('63px');
        expect(dom.style.getPropertyValue('--editor-activity-rail-offset')).toBe('19px');
        expect(dom.style.getPropertyValue('--editor-block-writing-inset')).toBe('0px');
        const write = jest.spyOn(dom.style, 'setProperty');
        synchronizeEditorBlockActionLayout({ dom, contentDOM, scrollDOM });
        expect(measurements).toHaveLength(3);
        expect(write).not.toHaveBeenCalled();
    } finally {
        dom.remove();
    }
});

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
