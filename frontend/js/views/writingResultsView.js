import { writingReviewCards, writingReviewPageSize, writingBulkAvailable } from '../core/writingReviewModel.js';
import { createWritingDetailsView } from './writingDetailsView.js';
import { limitWritingAlternatives } from './writingAlternativesView.js';
import { setTooltip } from '../tooltip.js';
import { createWritingExamplesView } from './writingExamplesView.js';
import { writingLensSupportsLanguage } from '../core/writingLensesModel.js';
import { selectedWritingLenses } from '../core/writingAnalysisModel.js';

function node(tag, className, text) {
    const value = document.createElement(tag); value.className = className; if (text) value.textContent = text; return value;
}
export function createWritingResultsView({ onNavigate, onApply, onApplyAll, onDismiss, onAcceptAcronym, onRetry }) {
    const element = node('section', 'writing-results');
    element.setAttribute('aria-label', 'Writing suggestions'); element.tabIndex = -1;
    const status = node('p', 'writing-lenses-description'); status.setAttribute('role', 'status');
    const retry = node('button', 'ui-button ui-button--quiet', 'Retry analysis'); retry.type = 'button'; retry.addEventListener('click', onRetry);
    const list = node('div', 'writing-results-list');
    const more = node('button', 'ui-button ui-button--quiet'); more.type = 'button';
    let limit = writingReviewPageSize, lastValue, owner;
    const positions = new Map();
    more.addEventListener('click', () => {
        const previous = limit;
        limit += writingReviewPageSize; signature = ''; api.update(lastValue);
        (list.children[previous]?.querySelector('button') || element).focus();
    });
    element.append(status, retry, list, more);
    let signature = '', disclosure = new Set();
    function button(text, label, action, key) {
        const control = node('button', 'ui-button', text); control.type = 'button';
        control.setAttribute('aria-label', label); control.dataset.focusKey = key; control.addEventListener('click', action); return control;
    }
    const api = {
        element,
        // One property invalidates every old card without walking/rebuilding
        // its controls during an editor input event.
        invalidate() { element.inert = true; },
        announce(text) { status.textContent = text; },
        update(value) {
            element.inert = false;
            lastValue = value;
            if (owner !== value.current?.id) { owner = value.current?.id; limit = writingReviewPageSize; positions.clear(); }
            const { current, groups = [], count = 0, states = {}, rejected = 0 } = value;
            const cards = value.cards || writingReviewCards(groups);
            const selected = selectedWritingLenses(current?.preferences);
            const failure = Object.values(states).some(state => ['failed', 'unavailable', 'timed out'].includes(state)) || rejected > 0;
            const busy = Object.values(states).includes('analyzing');
            const summary = count > cards.length && cards.length ? `${cards.length} suggestion${cards.length === 1 ? '' : 's'} across ${count} occurrences` : `${count} suggestion${count === 1 ? '' : 's'}`;
            let message = busy ? 'Analyzing…' : count ? summary : 'No suggestions from the selected checks.';
            if (busy && count) message = `Partial results: ${summary}. Analyzing remaining checks…`;
            if (!current) message = 'Open a Markdown note to review writing.';
            else if (current.language === 'none') message = 'Choose an analysis language to review suggestions.';
            else if (!selected.length) message = 'Choose a writing lens to review suggestions.';
            else if (!selected.some(lens => writingLensSupportsLanguage(lens, current.language))) message = 'Choose a supported lens to review suggestions.';
            if (failure) message = `Partial results. Some checks are unavailable. ${message}`;
            if (current?.decisionsFailed) message = 'Saved review decisions need refreshing. Retry them to resume analysis.';
            status.textContent = message;
            status.classList.toggle('ui-notice', failure); status.classList.toggle('ui-notice--warning', failure);
            retry.hidden = !failure || Boolean(current?.decisionsFailed);
            for (const control of list.querySelectorAll('[data-writing-bulk]')) control.disabled = busy;
            const nextSignature = JSON.stringify([current?.id, current?.revision, current?.configuration, value.resultVersion ?? groups]);
            if (nextSignature === signature) return;
            signature = nextSignature;
            const hadFocus = list.contains(document.activeElement);
            const focusKey = document.activeElement?.dataset.focusKey;
            const focusedRow = document.activeElement?.closest('[data-finding]');
            const rowIndex = [...list.querySelectorAll('[data-finding]')].indexOf(focusedRow);
            list.replaceChildren();
            more.hidden = cards.length <= limit;
            more.textContent = `Show more suggestions (${Math.min(limit, cards.length)} of ${cards.length} shown)`;
            for (const card of cards.slice(0, limit)) {
                const section = node('section', 'writing-result-group');
                const position = Math.min(positions.get(card.key) || 0, card.findings.length - 1);
                for (const finding of [card.findings[position]]) {
                    const displayId = finding.displayId || finding.id;
                    const row = node('div', 'ui-suggestion writing-result-row'); row.dataset.finding = displayId;
                    const heading = button(finding.title, `Go to ${finding.title}: ${finding.actual}`, () => onNavigate(finding), `${displayId}:navigate`);
                    heading.classList.add('ui-button--quiet', 'writing-result-location');
                    setTooltip(heading, `Go to “${finding.actual}” in the document`);
                    heading.insertAdjacentHTML('afterbegin', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 .2l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.2l-3 3a5 5 0 0 0 7 7l2-2"/></svg>');
                    row.append(heading, node('p', 'writing-lenses-description', finding.message));
                    if (card.findings.length > 1) {
                        const occurrences = node('div', 'writing-result-actions');
                        occurrences.append(node('span', 'writing-lenses-description', `Occurrence ${position + 1} of ${card.findings.length}`));
                        for (const [text, delta] of [['Previous', -1], ['Next', 1]]) {
                            occurrences.append(button(text, `${text} occurrence of ${finding.title}`, () => {
                                const next = (position + delta + card.findings.length) % card.findings.length;
                                positions.set(card.key, next); signature = ''; api.update(lastValue);
                                onNavigate(card.findings[next]);
                            }, `${displayId}:${text.toLowerCase()}`));
                        }
                        row.append(occurrences);
                    }
                    const actions = node('div', 'writing-result-actions');
                    finding.fixes.forEach((fix, index) => actions.append(button(`Apply “${fix.replacement}”`, `Replace “${fix.expected}” with “${fix.replacement}”`, () => onApply(finding.id, index, value.analyzed), `${displayId}:apply:${index}`)));
                    limitWritingAlternatives(actions, [...actions.children]);
                    const remember = (text, label, action, key) => button(text, label, async () => {
                        const controls = [...actions.querySelectorAll('button')]; controls.forEach(control => { control.disabled = true; });
                        actions.setAttribute('aria-busy', 'true'); api.announce('Saving review decision…');
                        try { await action(); }
                        catch (error) { api.announce(error.message || 'Couldn’t save the review decision. Try again.'); status.classList.add('ui-notice', 'ui-notice--warning'); }
                        finally { controls.forEach(control => { control.disabled = false; }); actions.removeAttribute('aria-busy'); }
                    }, key);
                    actions.append(remember('Ignore this occurrence', `Ignore ${finding.title}`, () => onDismiss(finding.id, value.analyzed), `${displayId}:dismiss`));
                    if (finding.kind === 'clarity.undefined-acronym' && onAcceptAcronym) {
                        actions.append(remember(`Accept “${finding.actual}” in this document`, `Accept “${finding.actual}” in this document`,
                            () => onAcceptAcronym(finding.id, value.analyzed), `${displayId}:accept-acronym`));
                    }
                    if (onApplyAll && writingBulkAvailable(card)) {
                        const bulk = button(`Apply “${finding.fixes[0].replacement}” to all ${card.findings.length} occurrences`, `Apply to all ${card.findings.length} occurrences in this document`, () => onApplyAll(finding.id, value.analyzed), `${displayId}:apply-all`);
                        bulk.dataset.writingBulk = ''; bulk.disabled = busy; actions.append(bulk);
                    }
                    const evidence = createWritingDetailsView(finding);
                    evidence.hidden = !disclosure.has(displayId);
                    const details = button('Details', `Details for ${finding.title}`, () => {
                        evidence.hidden = !evidence.hidden; details.setAttribute('aria-expanded', String(!evidence.hidden));
                        if (evidence.hidden) disclosure.delete(displayId); else disclosure.add(displayId);
                    }, `${displayId}:details`);
                    details.setAttribute('aria-expanded', String(!evidence.hidden)); actions.append(details); row.append(actions, createWritingExamplesView(finding), evidence); section.append(row);
                }
                list.append(section);
            }
            if (hadFocus) {
                const same = [...list.querySelectorAll('[data-focus-key]')].find(item => item.dataset.focusKey === focusKey);
                const rows = list.querySelectorAll('[data-finding]');
                (same || rows[Math.min(Math.max(rowIndex, 0), rows.length - 1)]?.querySelector('button') || element).focus({ preventScroll: true });
            }
            disclosure = new Set([...disclosure].filter(id => groups.some(group => group.findings.some(item => (item.displayId || item.id) === id))));
        },
    };
    return api;
}
