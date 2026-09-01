export function isISODate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function localISODate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function dateFromISO(value) {
    if (!isISODate(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
}

export function shiftISODate(value, days) {
    const date = dateFromISO(value);
    if (!date) return '';
    date.setDate(date.getDate() + Number(days || 0));
    return localISODate(date);
}

export function millisecondsUntilNextLocalDay(date = new Date()) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 50);
    return Math.max(50, next.getTime() - date.getTime());
}

export function dueDatePresentation(dueDate, today = localISODate(), locale = undefined) {
    const date = dateFromISO(dueDate);
    if (!date || !isISODate(today)) return null;
    const shortDate = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
    if (dueDate < today) return { state: 'overdue', label: `Overdue · ${shortDate}` };
    if (dueDate === today) return { state: 'today', label: 'Due today' };
    if (dueDate === shiftISODate(today, 1)) return { state: 'upcoming', label: 'Tomorrow' };
    return { state: 'upcoming', label: `Due ${shortDate}` };
}

export function dueTaskSummary(boardData, today = localISODate()) {
    const unique = new Map();
    for (const [column, cards] of Object.entries(boardData || {})) {
        if (column.toLowerCase() === 'done') continue;
        for (const card of cards || []) {
            if (!card?.file || !card.due_date || card.completed) continue;
            const key = `${card.file}\u0000${Number(card.line) || 0}`;
            if (!unique.has(key)) unique.set(key, card);
        }
    }
    let dueToday = 0;
    let overdue = 0;
    for (const task of unique.values()) {
        if (task.due_date === today) dueToday++;
        else if (task.due_date < today) overdue++;
    }
    return { dueToday, overdue, total: dueToday + overdue };
}

export function sortTasksByDue(tasks, today = localISODate()) {
    return (tasks || []).map((task, index) => ({ task, index })).sort((left, right) => {
        const leftKey = dueSortKey(left.task?.due_date, today);
        const rightKey = dueSortKey(right.task?.due_date, today);
        if (leftKey.group !== rightKey.group) return leftKey.group - rightKey.group;
        if (leftKey.date !== rightKey.date) return leftKey.date.localeCompare(rightKey.date);
        return left.index - right.index;
    }).map(entry => entry.task);
}

function dueSortKey(dueDate, today) {
    if (!isISODate(dueDate)) return { group: 3, date: '' };
    if (dueDate < today) return { group: 0, date: dueDate };
    if (dueDate === today) return { group: 1, date: dueDate };
    return { group: 2, date: dueDate };
}

export function datePickerMonth(year, month, { selected = '', today = localISODate() } = {}) {
    const first = new Date(year, month, 1, 12);
    const start = new Date(year, month, 1 - first.getDay(), 12);
    return Array.from({ length: 42 }, (_unused, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const iso = localISODate(date);
        return {
            date: iso,
            day: date.getDate(),
            inMonth: date.getMonth() === month,
            selected: iso === selected,
            today: iso === today,
        };
    });
}
