import { expect } from '@playwright/test';

// Real layout/animation boundary: final-position checks miss a wrong frame
// during a buffered range swap. Both consumers exercise this same probe.
export async function expectContinuousTimelinePaint(page, scrollSelector, daySelector) {
    for (const direction of [-1, 1]) {
        const result = await page.locator(scrollSelector).evaluate(async (scroll, { selector, direction }) => {
            const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
            const dayWidth = scroll.querySelector(selector).getBoundingClientRect().width;
            const left = direction < 0 ? dayWidth * 14.5 : scroll.scrollWidth - scroll.clientWidth - dayWidth * 14.5;
            scroll.scrollTo({ left, behavior: 'instant' });
            await frame(); await frame(); await frame();
            const firstDate = scroll.querySelector(selector).dataset.date;
            const samples = [];
            for (let i = 0; i < 65; i++) {
                if ([2, 8, 14].includes(i)) scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: direction * 4, bubbles: true, cancelable: true }));
                await frame();
                const day = scroll.querySelector(selector);
                samples.push(day ? {
                    date: day.dataset.date,
                    // A stable world coordinate, independent of the buffered origin.
                    position: Date.parse(`${day.dataset.date}T00:00:00Z`) / 86400000 * dayWidth - day.getBoundingClientRect().left,
                } : null);
            }
            return { dayWidth, firstDate, samples };
        }, { selector: daySelector, direction });
        expect(result.samples.every(Boolean), 'the timeline must never paint an empty track').toBe(true);
        expect(result.samples.some(sample => sample.date !== result.firstDate), 'the probe must cross a buffered page boundary').toBe(true);
        const deltas = result.samples.slice(1).map((sample, index) => direction * (sample.position - result.samples[index].position));
        expect(Math.min(...deltas), `scrolling must not flash backwards: ${JSON.stringify(deltas)}`).toBeGreaterThanOrEqual(-1);
        expect(Math.max(...deltas), 'a page replacement must not flash a week in one frame').toBeLessThanOrEqual(result.dayWidth * 3 + 1);
        const progress = direction * (result.samples.at(-1).position - result.samples[0].position);
        expect(progress, 'paging must not drop any of the three three-day wheel inputs').toBeGreaterThanOrEqual(result.dayWidth * 9 - 2);
    }
}
