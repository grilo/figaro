import { activeIndentationLines } from '../../../frontend/js/core/indentationMarkerModel.js';

function previousScope(entries, currentNumber) {
    const map = new Map(entries.map(entry => [entry.number, entry]));
    let current = map.get(currentNumber);
    if (!current) return [];
    if (map.get(current.number + 1)?.level > current.level) current = map.get(current.number + 1);
    if (map.get(current.number - 1)?.level > current.level) current = map.get(current.number - 1);
    if (!current.level) return [];
    const active = [current.number];
    for (const direction of [-1, 1]) {
        for (let number = current.number + direction; number >= 1 && number <= 100; number += direction) {
            const entry = map.get(number);
            if (!entry) continue;
            if (entry.level < current.level) break;
            active.push(number);
        }
    }
    return active.sort((a, b) => a - b).map(number => ({ number, level: current.level }));
}

test('bounded scope preserves nesting, adjacent block entry/exit and gaps in cached lines', () => {
    let seed = 911;
    for (let example = 0; example < 100; example++) {
        const entries = [];
        for (let number = 1; number <= 100; number++) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            if (seed % 3) entries.push({ number, level: seed % 5 });
        }
        for (const current of [1, 2, 40, 80, 100]) {
            expect(activeIndentationLines(entries, current)).toEqual(previousScope(entries, current));
        }
    }
});
