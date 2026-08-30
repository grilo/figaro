function normalized(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/** Rank searchable help/settings destinations without knowing about the DOM. */
export function helpSearchResults(query, entries = [], limit = 12) {
    const terms = normalized(query).split(' ').filter(Boolean);
    if (!terms.length) return [];

    return entries
        .map((entry, order) => {
            const title = normalized(entry.title);
            const searchable = normalized([
                entry.title,
                entry.category,
                entry.detail,
                ...(entry.keywords || []),
            ].join(' '));
            if (!terms.every(term => searchable.includes(term))) return null;

            const fullQuery = terms.join(' ');
            let score = 40;
            if (title === fullQuery) score = 0;
            else if (title.startsWith(fullQuery)) score = 10;
            else if (title.includes(fullQuery)) score = 20;
            else if (terms.every(term => title.includes(term))) score = 30;
            return { entry, order, score: score + (Number(entry.priority) || 0) };
        })
        .filter(Boolean)
        .sort((left, right) => left.score - right.score || left.order - right.order)
        .slice(0, limit)
        .map(result => result.entry);
}
