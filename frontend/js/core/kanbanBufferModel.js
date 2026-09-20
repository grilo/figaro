const cardFields = ['source', 'file', 'file_name', 'line', 'text', 'tag', 'completed'];

export function sameKanbanCards(left, right) {
    return left.length === right.length && left.every((card, index) => (
        cardFields.every(field => card[field] === right[index][field])
    ));
}

/** Retain only open dirty buffers, and preserve projections for prose-only edits. */
export function createKanbanBufferProjection(parse) {
    let records = new Map();
    let projection = new Map();
    return snapshots => {
        const next = new Map();
        let changed = snapshots.size !== records.size;
        const previousPaths = records.keys();
        for (const [path, content] of snapshots) {
            if (previousPaths.next().value !== path) changed = true;
            const previous = records.get(path);
            let cards = previous?.cards;
            if (!previous || previous.content !== content) {
                const parsed = parse(path, content);
                if (!previous || !sameKanbanCards(previous.cards, parsed)) cards = parsed;
            }
            changed ||= !previous || cards !== previous.cards;
            next.set(path, { content, cards });
        }
        records = next;
        if (changed) projection = new Map([...records].map(([path, { cards }]) => [path, cards]));
        return projection;
    };
}

export function overlayKanbanCards(boardData, projections) {
    const board = {};
    for (const [column, tasks] of Object.entries(boardData || {})) {
        board[column] = (tasks || []).filter(task => !projections.has(task.file));
    }
    for (const cards of projections.values()) {
        for (const card of cards) {
            if (!board[card.tag]) board[card.tag] = [];
            board[card.tag].push(card);
        }
    }
    return board;
}
