/** Active scope among cached lines; gaps carry no rendered indentation marks. */
export function activeIndentationLines(entries, currentNumber) {
    const ordered = [...entries].sort((left, right) => left.number - right.number);
    let index = ordered.findIndex(entry => entry.number === currentNumber);
    if (index < 0) return [];
    if (ordered[index + 1]?.number === ordered[index].number + 1
        && ordered[index + 1].level > ordered[index].level) index++;
    if (ordered[index - 1]?.number === ordered[index].number - 1
        && ordered[index - 1].level > ordered[index].level) index--;
    const level = ordered[index].level;
    if (!level) return [];
    let from = index, to = index;
    while (from > 0 && ordered[from - 1].level >= level) from--;
    while (to + 1 < ordered.length && ordered[to + 1].level >= level) to++;
    return ordered.slice(from, to + 1).map(entry => ({ number: entry.number, level }));
}
