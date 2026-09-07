import { parser, GFM } from '@lezer/markdown';
import { leadingFrontmatterEnd } from './markdownBlockGuideModel.js';

const markdown = parser.configure(GFM);
const linesOf = source => String(source ?? '').replace(/\r\n/g, '\n').split('\n');

/** Exact unchanged-line attribution, including prepends and unique moves. */
export function matchActivityLines(before, after) {
    const result = Array(after.length).fill(-1), used = new Set();
    function match(a, b, c, d) {
        while (a < b && c < d && before[a] === after[c]) { result[c++] = a; used.add(a++); }
        while (a < b && c < d && before[b - 1] === after[d - 1]) { result[--d] = --b; used.add(b); }
        if (a === b || c === d) return;
        const old = new Map(), next = new Map();
        for (let i = a; i < b; i++) old.set(before[i], old.has(before[i]) ? -1 : i);
        for (let i = c; i < d; i++) next.set(after[i], (next.get(after[i]) || 0) + 1);
        const anchors = [], tails = [];
        for (let i = c; i < d; i++) {
            const pos = old.get(after[i]);
            if (!after[i].trim() || pos === undefined || pos < 0 || next.get(after[i]) !== 1) continue;
            let lo = 0, hi = tails.length;
            while (lo < hi) { const mid = (lo + hi) >> 1; if (anchors[tails[mid]].old < pos) lo = mid + 1; else hi = mid; }
            anchors.push({ old: pos, next: i, previous: lo ? tails[lo - 1] : -1 });
            tails[lo] = anchors.length - 1;
        }
        if (tails.length) {
            const chain = [];
            for (let i = tails.at(-1); i >= 0; i = anchors[i].previous) chain.push(anchors[i]);
            for (const p of chain.reverse()) { match(a, p.old, c, p.next); result[p.next] = p.old; used.add(p.old); a = p.old + 1; c = p.next + 1; }
            match(a, b, c, d); return;
        }
        if ((b - a) * (d - c) > 65536) {
            for (let i = c; i < d; i++) if (old.has(after[i])) result[i] = -2;
            return;
        }
        const width = d - c + 1, cells = new Uint32Array((b - a + 1) * width);
        for (let i = b - a - 1; i >= 0; i--) for (let j = d - c - 1; j >= 0; j--) {
            cells[i * width + j] = before[a + i] === after[c + j]
                ? 1 + cells[(i + 1) * width + j + 1]
                : Math.max(cells[(i + 1) * width + j], cells[i * width + j + 1]);
        }
        let i = 0, j = 0;
        while (i < b - a && j < d - c) {
            if (before[a + i] === after[c + j]) { result[c + j] = a + i; used.add(a + i); i++; j++; }
            else if (cells[(i + 1) * width + j] >= cells[i * width + j + 1]) i++;
            else j++;
        }
    }
    match(0, before.length, 0, after.length);
    const old = new Map(), next = new Map();
    before.forEach((text, i) => old.set(text, old.has(text) ? -1 : i));
    after.forEach(text => next.set(text, (next.get(text) || 0) + 1));
    after.forEach((text, i) => {
        const pos = old.get(text);
        if (result[i] < 0 && text.trim() && pos >= 0 && next.get(text) === 1 && !used.has(pos)) { result[i] = pos; used.add(pos); }
    });
    return result;
}

export function activityDateKey(timestamp, timeZone) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp * 1000));
    const value = type => parts.find(p => p.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
}

const activityMonthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format an already-local date key consistently, without consulting today's date. */
export function formatActivityMarginDate(key) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    if (!parts) return '';
    const [, year, month, day] = parts;
    const label = activityMonthLabels[Number(month) - 1];
    return label ? `${Number(day)} ${label} ${year.slice(-2)}` : '';
}

/** Observed edits supply a temporary display date until Git confirms attribution. */
export function applyProvisionalActivityDate(passage, editDate) {
    if (!editDate || passage.status === 'recorded') return passage;
    return { ...passage, status: 'unrecorded', date: editDate, provisional: true };
}

/** Group adjacent displayed days, retaining pending status within a mixed group. */
export function groupActivityPassages(passages) {
    const groups = [];
    for (const passage of passages) {
        const key = passage.date || passage.status;
        const previous = groups.at(-1);
        if (previous?.key === key) {
            previous.to = passage.to;
            previous.passages.push(passage);
            previous.provisional ||= Boolean(passage.provisional);
        } else groups.push({ key, date: passage.date, status: passage.status, provisional: Boolean(passage.provisional), from: passage.from, to: passage.to, passages: [passage] });
    }
    return groups;
}

function sourceLineStarts(source) {
    const starts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
    return starts;
}
function lineAt(starts, position) {
    let lo = 0, hi = starts.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= position) lo = mid + 1; else hi = mid; }
    return Math.max(0, lo - 1);
}

/** Runs in the activity worker; no Markdown parsing or text diff on key input. */
export function projectActivity({ source, recorded, timeZone }) {
    const text = String(source ?? '');
    if (text.length > 2 * 1024 * 1024) throw new Error('Activity is limited to notes up to 2 MiB.');
    const baseline = recorded || { source: '', lines: [], events: [] };
    const events = baseline.events || [];
    const mapping = matchActivityLines(linesOf(baseline.source), linesOf(text));
    // Preserve the prior history of a draft replacement until Git records it.
    // Insertions between unchanged neighbors have an empty prior interval.
    const priorEvents = new Map();
    for (let i = 0; i < mapping.length;) {
        if (mapping[i] !== -1) { i++; continue; }
        const start = i;
        while (i < mapping.length && mapping[i] === -1) i++;
        const oldStart = start ? mapping[start - 1] + 1 : 0;
        const oldEnd = i < mapping.length ? mapping[i] : (baseline.lines?.length || 0);
        if (oldStart < 0 || oldEnd < oldStart) continue;
        const ids = new Set();
        for (let old = oldStart; old < oldEnd; old++) {
            const id = baseline.lines[old]?.event;
            if (id >= 0 && events[id]) ids.add(id);
        }
        for (let line = start; line < i; line++) priorEvents.set(line, ids);
    }
    const starts = sourceLineStarts(text), paragraphs = [], dates = new Map();
    const frontmatterEnd = leadingFrontmatterEnd(text);
    const tree = markdown.parse(text);
    for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
        if (node.from < frontmatterEnd || node.name === 'HorizontalRule') continue;
        const first = lineAt(starts, node.from), last = lineAt(starts, Math.max(node.from, node.to - 1));
        const ids = new Set(); let pending = false, unknown = false;
        for (let line = first; line <= last; line++) {
            if (!text.slice(starts[line], starts[line + 1] ?? text.length).trim()) continue;
            const old = mapping[line];
            if (old === -2) { unknown = true; continue; }
            if (old < 0 || !baseline.lines?.[old]) {
                pending = true; for (const id of priorEvents.get(line) || []) ids.add(id); continue;
            }
            const id = baseline.lines[old].event;
            if (id < 0 || !events[id]) unknown = true; else ids.add(id);
        }
        const latest = ids.size ? Math.max(...ids) : -1;
        const status = pending ? 'unrecorded' : unknown || latest < 0 ? 'unknown' : 'recorded';
        const timestamp = events[latest]?.timestamp;
        if (status === 'recorded' && !dates.has(timestamp)) dates.set(timestamp, activityDateKey(timestamp, timeZone));
        const raw = text.slice(node.from, node.to);
        paragraphs.push({ from: starts[first], to: node.to, status, date: status === 'recorded' ? dates.get(timestamp) : '', timestamp,
            events: [...ids], title: raw.split('\n').find(line => line.trim())?.replace(/^#{1,6}\s+/, '').slice(0, 120) || 'Passage',
            excerpt: raw.slice(0, 280) });
    }
    return { passages: paragraphs, events, partial: Boolean(baseline.partial), revision: baseline.revision || '' };
}

/** Resolve earlier changes without losing their order or looping on corrupt data. */
export function activityEventsForPassages(passages, events) {
    const seen = new Set(), pending = passages.flatMap(p => p.events || []);
    while (pending.length) {
        const id = pending.pop();
        if (seen.has(id) || !events[id]) continue;
        seen.add(id); pending.push(...(events[id].parents || []));
    }
    return [...seen].sort((a, b) => b - a).map(id => ({ ...events[id], id }));
}

/** Map a selected passage through known editor changes without reading its text. */
export function remapActivityScope(scope, changes = []) {
    if (!scope) return null;
    const map = (position, association) => {
        let delta = 0;
        for (const change of changes) {
            if (position < change.from || (position === change.from && association < 0)) break;
            if (position <= change.to) return change.from + delta + (association > 0 ? change.insertedLength : 0);
            delta += change.insertedLength - (change.to - change.from);
        }
        return position + delta;
    };
    const from = map(scope.from, 1), to = map(scope.to, -1);
    return to > from ? { from, to } : null;
}
