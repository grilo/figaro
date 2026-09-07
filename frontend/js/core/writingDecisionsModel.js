/** Persistent review policy. Never choose between indistinguishable occurrences. */
export function writingDecisionRange(source, decision) {
    if (decision.type !== 'occurrence' || !decision.text) return null;
    const context = (decision.before || '') + decision.text + (decision.after || '');
    const start = source.indexOf(context);
    if (start >= 0) {
        if (source.indexOf(context, start + 1) >= 0) return null;
        return { from: start + (decision.before || '').length, to: start + (decision.before || '').length + decision.text.length };
    }
    if (decision.exactOnly) return null;
    // A sufficiently distinctive unchanged side can survive edits on the other side.
    // Count every candidate, rather than guessing the closest offset after a reload.
    const strong = text => {
        if (text.trim().length < 12 || text.trim().split(/\s+/u).length < 2) return false;
        const at = source.indexOf(text);
        return at >= 0 && at === source.lastIndexOf(text);
    };
    const beforeStrong = strong(decision.before || ''), afterStrong = strong(decision.after || '');
    if (!beforeStrong && !afterStrong) return null;
    const matches = [];
    for (let from = source.indexOf(decision.text); from >= 0; from = source.indexOf(decision.text, from + 1)) {
        const to = from + decision.text.length;
        if ((beforeStrong && source.slice(Math.max(0, from - decision.before.length), from) === decision.before)
            || (afterStrong && source.slice(to, to + decision.after.length) === decision.after)) matches.push({ from, to });
    }
    return matches.length === 1 ? matches[0] : null;
}

/** Follow a known contiguous source change only when it leaves the target intact. */
export function remapWritingDecision(decision, before, after, changes) {
    const range = writingDecisionRange(before, decision);
    if (!range || before === after) return decision;
    let start = 0, suffix = 0;
    if (!changes) {
        while (start < before.length && start < after.length && before[start] === after[start]) start++;
        while (suffix < before.length - start && suffix < after.length - start && before.at(-1 - suffix) === after.at(-1 - suffix)) suffix++;
    }
    const edits = changes || [{ from: start, to: before.length - suffix, insertedLength: after.length - start - suffix }];
    // Without editor ranges a deletion between similar passages is ambiguous.
    if (edits.some(edit => range.from < edit.to && range.to > edit.from)
        || (!changes && before.slice(start, before.length - suffix).includes(decision.text))) return { ...decision, exactOnly: true };
    const shift = edits.filter(edit => edit.to <= range.from).reduce((sum, edit) => sum + edit.insertedLength - (edit.to - edit.from), 0);
    const from = range.from + shift, to = range.to + shift;
    const mapped = { ...decision, before: after.slice(Math.max(0, from - 64), from).replace(/^[\uDC00-\uDFFF]/u, ''), after: after.slice(to, to + 64).replace(/[\uD800-\uDBFF]$/u, '') };
    const identified = writingDecisionRange(after, mapped);
    return identified?.from === from && identified.to === to ? mapped : decision;
}

export function writingDecisionFailure(cause) {
    const message = String(cause?.message || cause || '');
    if (/too many saved review decisions/.test(message)) return 'This document has 1,000 saved review decisions. Restore an old suggestion to make room.';
    if (/saved review decisions are full/.test(message)) return 'Saved review decisions are full. Remove an old decision to make room.';
    return '';
}

export function createWritingDecision(finding, source, language, type, id) {
    if (!finding || !id || !['en-US', 'en-GB', 'es'].includes(language)) throw new Error('This suggestion needs refreshing.');
    if (type === 'acronym') {
        if (language === 'es' || finding.kind !== 'clarity.undefined-acronym' || !/^[A-Z]{3,5}$/.test(finding.actual)) throw new Error('Choose an undefined acronym.');
        return { id, type, acronym: finding.actual, language };
    }
    const { from, to } = finding;
    const text = source.slice(from, to);
    if (type !== 'occurrence' || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > source.length || to <= from
        || text !== (finding.sourceText ?? finding.actual) || text.length > 8192) throw new Error('This suggestion cannot be remembered safely.');
    const decision = { id, type, kind: finding.kind, title: finding.title, language, text,
        before: source.slice(Math.max(0, from - 64), from).replace(/^[\uDC00-\uDFFF]/u, ''), after: source.slice(to, to + 64).replace(/[\uD800-\uDBFF]$/u, '') };
    if (!writingDecisionRange(source, decision)) throw new Error('This occurrence has identical context elsewhere. It cannot be ignored separately.');
    return decision;
}

export function applyWritingDecisions(findings, decisions, source, language) {
    const ranges = decisions.filter(item => item.language === language && item.type === 'occurrence')
        .map(item => ({ ...item, range: writingDecisionRange(source, item) })).filter(item => item.range);
    const accepted = new Set(decisions.filter(item => item.language === language && item.type === 'acronym').map(item => item.acronym));
    for (const finding of findings) {
        if (finding.kind === 'clarity.undefined-acronym' && accepted.has(finding.actual)) finding.suppressed = 'Acronym accepted for this document';
        else if (ranges.some(item => item.kind === finding.kind && item.range.from === finding.from && item.range.to === finding.to)) {
            finding.suppressed = 'Occurrence ignored for this document';
        }
    }
}

export function writingDecisionLabel(decision) {
    return decision.type === 'acronym' ? `Accepted acronym: ${decision.acronym}` : `${decision.title}: “${decision.text}”`;
}
