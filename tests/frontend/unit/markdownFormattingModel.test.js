import { formattingMarkerVisibility } from '../../../frontend/js/core/markdownFormattingModel.js';

const markers = [
    { from: 0, to: 2, line: 1, block: true },
    { from: 10, to: 12, line: 2, block: false },
    { from: 20, to: 21, line: 3, block: true },
];
test.each([
    ['block line', [{ from: 5, to: 5 }], [{ from: 1, to: 1 }], true, false, [true, false, false]],
    ['inclusive inline boundary', [{ from: 12, to: 12 }], [{ from: 2, to: 2 }], true, false, [false, true, false]],
    ['multiple selections', [{ from: 11, to: 11 }, { from: 22, to: 22 }], [{ from: 2, to: 2 }, { from: 3, to: 3 }], true, false, [false, true, true]],
    ['long selected line interval', [{ from: 0, to: 1000000 }], [{ from: 1, to: 100000 }], true, false, [true, true, true]],
    ['collapse disabled retains block rule', [{ from: 0, to: 30 }], [{ from: 1, to: 3 }], false, false, [true, false, true]],
    ['drag suppresses reveal', [{ from: 0, to: 30 }], [{ from: 1, to: 3 }], true, true, [false, false, false]],
])('%s keeps existing reveal semantics', (_name, selections, selectedLines, collapse, dragging, expected) => {
    expect(formattingMarkerVisibility({ markers, selections, selectedLines, collapse, dragging })).toEqual(expected);
});
