import { createWritingExamplesView } from './writingExamplesView.js';
import { limitWritingAlternatives } from './writingAlternativesView.js';

/** A merged entry lists each reason; its first reason is the heading. */
export function writingFindingReasons(finding) {
    return finding.reasons?.length ? finding.reasons : [{ title: finding.title, message: finding.message }];
}

/** The findings an action on this entry covers, with the member that owns each capability. */
export function writingFindingMembers(finding) {
    return finding.spanMembers || [finding];
}

/** One example per distinct concern an entry covers. */
export function writingFindingExamples(finding) {
    const seen = new Set();
    return writingFindingMembers(finding).filter(member => !seen.has(member.kind) && seen.add(member.kind))
        .map(member => createWritingExamplesView(member));
}

/** Ignore every finding an entry covers; one finding keeps the direct call. */
export function ignoreWritingFinding(finding, ignore) {
    const members = writingFindingMembers(finding);
    if (members.length === 1) return ignore(members[0].id);
    return members.reduce((previous, member) => previous.then(() => ignore(member.id)), Promise.resolve());
}
/** Compose the approved menu surface and standard buttons for an inline review. */
export function createWritingInlineView({ findings, stale = false, onApply, onApplyAll, bulkCount = () => 0, onIgnore, onAcceptAcronym, onAddWord, onClose }) {
    const dom = document.createElement('div');
    dom.className = 'ui-menu cm-writing-tooltip';
    dom.setAttribute('role', 'dialog'); dom.setAttribute('aria-label', 'Writing suggestions');
    const status = document.createElement('p');
    status.className = 'writing-lenses-description'; status.setAttribute('role', 'status'); status.hidden = true;
    if (stale) { status.hidden = false; status.textContent = 'Refreshing suggestions. Actions will return when checks finish.'; }
    const button = (text, label, action) => {
        const control = document.createElement('button');
        control.type = 'button'; control.className = 'ui-button';
        control.textContent = text; control.setAttribute('aria-label', label);
        control.disabled = stale;
        control.addEventListener('click', event => { if (!stale) action(event); }); return control;
    };
    for (const finding of findings) {
        const section = document.createElement('section'); section.className = 'writing-inline-finding';
        const members = writingFindingMembers(finding);
        const reasons = writingFindingReasons(finding).flatMap(reason => {
            const title = document.createElement('strong'); title.textContent = reason.title;
            const message = document.createElement('p'); message.className = 'writing-lenses-description'; message.textContent = reason.message;
            return [title, message];
        });
        const actions = document.createElement('div'); actions.className = 'writing-result-actions';
        finding.fixes.forEach((fix, index) => actions.append(button(`Apply “${fix.replacement}”`,
            `Replace “${fix.expected}” with “${fix.replacement}”`, () => onApply(fix.findingId ?? finding.id, fix.index ?? index))));
        limitWritingAlternatives(actions, [...actions.children]);
        const remember = (text, label, action) => button(text, label, async () => {
            const controls = [...actions.querySelectorAll('button')]; controls.forEach(control => { control.disabled = true; });
            actions.setAttribute('aria-busy', 'true'); status.hidden = false; status.textContent = 'Saving review decision…';
            try { await action(); status.textContent = ''; status.hidden = true; }
            catch (error) { status.textContent = error.message || 'Couldn’t save the review decision. Try again.'; status.classList.add('ui-notice', 'ui-notice--warning'); }
            finally { controls.forEach(control => { control.disabled = false; }); actions.removeAttribute('aria-busy'); }
        });
        actions.append(remember('Ignore this occurrence', `Ignore ${finding.title} in this document`,
            () => ignoreWritingFinding(finding, onIgnore)));
        const count = finding.spanMembers ? 0 : bulkCount(finding.id);
        if (count > 1 && onApplyAll) actions.append(button(`Apply “${finding.fixes[0].replacement}” to all ${count} occurrences`,
            `Apply to all ${count} occurrences in this document`, () => onApplyAll(finding.id)));
        const acronym = members.find(member => member.kind === 'clarity.undefined-acronym');
        if (acronym && onAcceptAcronym) {
            actions.append(remember(`Accept “${finding.actual}” in this document`, `Accept “${finding.actual}” in this document`, () => onAcceptAcronym(acronym.id)));
        }
        const spelling = members.find(member => member.lens === 'spelling');
        if (spelling && onAddWord) {
            const add = button('Add to dictionary', `Add “${finding.actual}” to this vault’s dictionary`, async () => {
                add.disabled = true; add.setAttribute('aria-busy', 'true');
                status.hidden = false; status.textContent = 'Saving word…';
                try { await onAddWord(spelling); }
                catch (_) {
                    status.textContent = 'Couldn’t add this word. Nothing was changed. Try again.';
                    status.classList.add('ui-notice', 'ui-notice--warning');
                } finally { add.disabled = false; add.removeAttribute('aria-busy'); }
            });
            actions.append(add);
        }
        section.append(...reasons, actions, ...writingFindingExamples(finding)); dom.append(section);
    }
    dom.append(status);
    dom.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') {
            const controls = [...dom.querySelectorAll('button:not(:disabled)')].filter(button => !button.closest('[hidden]'));
            const index = controls.indexOf(document.activeElement);
            if ((event.shiftKey && index === 0) || (!event.shiftKey && index === controls.length - 1)) {
                event.preventDefault(); onClose();
            }
        }
    });
    return dom;
}
