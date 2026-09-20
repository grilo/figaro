

import { markdownGuidesInViewport } from '../../../frontend/js/core/markdownBlockGuideModel.js';
test('guide viewport lookup visits logarithmic boundaries plus visible entries', () => {
    let reads = 0;
    const guides = Array.from({ length: 10000 }, (_, index) => ({ get lineFrom() { reads++; return index * 10; } }));
    expect(markdownGuidesInViewport(guides, 99000, 99020)).toEqual(guides.slice(9900, 9903));
    expect(reads).toBeLessThan(25);
    expect(markdownGuidesInViewport(guides, 100000, 100010)).toEqual([]);
});
