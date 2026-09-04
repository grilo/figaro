import { expect } from '@playwright/test';

export async function expectContinuousKanbanScrollPaint(page, scrollSelector) {
    const scroll = page.locator(scrollSelector);
    const bounds = await scroll.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + Math.min(150, bounds.height / 2));

    const sampling = scroll.evaluate(async element => {
        const frames = [];
        let previousNodes = new Map();
        let previousRange = '';
        const rangeChanges = [];
        const stride = card => {
            const style = getComputedStyle(card);
            return card.getBoundingClientRect().height + (Number.parseFloat(style.marginBottom) || 0);
        };
        const evenStride = stride(element.querySelector('[data-card-index="0"]'));
        const oddStride = stride(element.querySelector('[data-card-index="1"]'));
        const logicalOffset = index => (
            Math.floor(index / 2) * (evenStride + oddStride)
            + (index % 2 ? evenStride : 0)
        );
        for (let frameIndex = 0; frameIndex < 90; frameIndex += 1) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const cards = [...element.querySelectorAll('.kanban-card')];
            const nodes = new Map(cards.map(card => [Number(card.dataset.cardIndex), card]));
            const range = cards.length
                ? `${cards[0].dataset.cardIndex}:${cards.at(-1).dataset.cardIndex}`
                : '';
            if (previousRange && range !== previousRange) {
                const shared = [...nodes.keys()].filter(index => previousNodes.has(index));
                rangeChanges.push({
                    from: previousRange,
                    to: range,
                    shared: shared.length,
                    replaced: shared.filter(index => previousNodes.get(index) !== nodes.get(index)).length,
                });
            }
            const rect = element.getBoundingClientRect();
            const visible = cards.find(card => {
                const cardRect = card.getBoundingClientRect();
                return cardRect.bottom > rect.top + 8 && cardRect.top < rect.bottom - 8;
            });
            const hovered = document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + Math.min(150, rect.height / 2),
            )?.closest('.kanban-card');
            frames.push({
                range,
                hitIndex: visible ? Number(visible.dataset.cardIndex) : null,
                coordinateError: visible
                    ? logicalOffset(Number(visible.dataset.cardIndex))
                        - (visible.getBoundingClientRect().top - rect.top)
                        - element.scrollTop
                    : null,
                scrolling: element.classList.contains('is-scrolling'),
                hoverIndex: hovered ? Number(hovered.dataset.cardIndex) : null,
                hoverShadow: hovered ? getComputedStyle(hovered).boxShadow : null,
            });
            previousNodes = nodes;
            previousRange = range;
        }
        return { frames, rangeChanges };
    });

    for (const deltaY of [1100, 1300, 1500, 1700, 1300]) {
        await page.mouse.wheel(0, deltaY);
        await page.waitForTimeout(24);
    }
    const result = await sampling;

    expect(result.frames.length, 'the probe must sample intermediate animation frames').toBeGreaterThan(40);
    expect(result.rangeChanges.length, 'the probe must cross multiple virtual-window boundaries').toBeGreaterThan(1);
    for (const change of result.rangeChanges) {
        expect(change.shared, `the ${change.from} → ${change.to} ranges must overlap`).toBeGreaterThan(0);
        expect(change.replaced, `overlapping cards must retain their DOM identity at ${change.from} → ${change.to}`).toBe(0);
    }

    const paintedFrames = result.frames.filter(sample => sample.scrolling);
    expect(paintedFrames.length, 'the probe must observe active scrolling frames').toBeGreaterThan(0);
    expect(
        paintedFrames.every(sample => sample.hitIndex !== null),
        `the card track must never paint blank while scrolling: ${JSON.stringify(paintedFrames)}`,
    ).toBe(true);
    const hoverFrames = paintedFrames.filter(sample => sample.hoverIndex !== null);
    expect(hoverFrames.length, 'the probe must observe hovered cards during active scrolling').toBeGreaterThan(0);
    expect(
        hoverFrames.every(sample => sample.hoverShadow === 'none'),
        `hover elevation must not trail the pointer while scrolling: ${JSON.stringify(hoverFrames)}`,
    ).toBe(true);
    const indices = paintedFrames.map(sample => sample.hitIndex);
    expect(
        indices.slice(1).every((index, position) => index >= indices[position]),
        `downward scrolling must not flash backwards: ${JSON.stringify(indices)}`,
    ).toBe(true);
    const coordinateErrors = paintedFrames.map(sample => sample.coordinateError);
    expect(
        Math.max(...coordinateErrors) - Math.min(...coordinateErrors),
        `measured virtual offsets must keep the logical viewport stable in every frame: ${JSON.stringify(coordinateErrors)}`,
    ).toBeLessThanOrEqual(2);
}

export async function expectContinuousKanbanWarmOpen(page, clickKanban) {
    await page.evaluate(() => {
        window.__kanbanPaintProbeWrapper = document.querySelector('.kanban-view-wrapper');
    });
    const sampling = page.evaluate(async () => {
        const frames = [];
        for (let index = 0; index < 55; index += 1) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const panel = document.getElementById('kanban-workspace-panel');
            if (!panel?.classList.contains('active')) continue;
            const wrapper = panel.querySelector('.kanban-view-wrapper');
            const style = getComputedStyle(panel);
            frames.push({
                sameWrapper: wrapper === window.__kanbanPaintProbeWrapper,
                cards: panel.querySelectorAll('.kanban-card').length,
                loading: panel.querySelectorAll('.kanban-loading').length,
                opacity: Number(style.opacity),
                transform: style.transform,
            });
        }
        delete window.__kanbanPaintProbeWrapper;
        return frames;
    });

    await clickKanban();
    const frames = await sampling;
    expect(frames.length, 'the probe must sample the warm-open paint').toBeGreaterThan(3);
    expect(
        frames.every(sample => sample.sameWrapper && sample.cards > 0 && sample.loading === 0),
        `a warm Kanban open must retain its populated surface in every frame: ${JSON.stringify(frames)}`,
    ).toBe(true);
    expect(
        frames.every(sample => sample.opacity === 1 && sample.transform === 'none'),
        `a warm Kanban open must not fade or translate the populated board: ${JSON.stringify(frames)}`,
    ).toBe(true);
}
