import { writingDecisionLabel } from '../core/writingDecisionsModel.js';
import { writingLanguages } from '../core/writingLensesModel.js';

/** Saved decisions reuse the existing disclosure button, suggestion cards and notices. */
export function createWritingDecisionsView({ id, onRestore, onRetry, onReconcile, onLayout = () => {} }) {
    const element = document.createElement('section'); element.className = 'writing-decisions';
    element.setAttribute('aria-label', 'Saved review decisions');
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'ui-button ui-button--quiet';
    const status = document.createElement('p'); status.className = 'writing-lenses-description'; status.setAttribute('role', 'status');
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'ui-button'; retry.textContent = 'Retry review decisions';
    retry.addEventListener('click', () => { void onRetry().catch(() => {}); });
    const reconcile = document.createElement('button'); reconcile.type = 'button'; reconcile.className = 'ui-button'; reconcile.textContent = 'Reload saved decisions';
    reconcile.addEventListener('click', () => { void onReconcile?.().catch(() => {}); });
    const list = document.createElement('div'); list.id = id; list.className = 'writing-results-list';
    const more = document.createElement('button'); more.type = 'button'; more.className = 'ui-button ui-button--quiet'; more.textContent = 'Show more saved decisions';
    toggle.setAttribute('aria-controls', id);
    let expanded = false, owner, limit = 25, current;
    toggle.addEventListener('click', () => { expanded = !expanded; render(); onLayout(); });
    more.addEventListener('click', () => {
        const previous = limit; limit += 25; render(); onLayout();
        (list.children[previous]?.querySelector('button') || toggle).focus();
    });
    element.append(toggle, status, retry, reconcile, list, more);
    function render() {
        const { decisions = [], status: state, error = '', activeIds } = current || {};
        const active = element.contains(document.activeElement), key = document.activeElement?.dataset.decision;
        toggle.textContent = `Saved review decisions (${decisions.length})`;
        toggle.setAttribute('aria-expanded', String(expanded));
        status.textContent = error || (state === 'saving' ? 'Saving review decision…' : state === 'loading' ? 'Loading saved review decisions…' : '');
        status.hidden = !status.textContent;
        status.classList.toggle('ui-notice', Boolean(error)); status.classList.toggle('ui-notice--warning', Boolean(error));
        retry.hidden = !['load-error', 'save-error', 'tracking-error'].includes(state);
        reconcile.hidden = state !== 'save-error' || !onReconcile;
        list.hidden = !expanded; list.replaceChildren();
        more.hidden = !expanded || decisions.length <= limit;
        if (!expanded) return;
        if (!decisions.length) {
            const empty = document.createElement('p'); empty.className = 'writing-lenses-description'; empty.textContent = 'No saved review decisions for this document.'; list.append(empty);
        }
        const path = owner;
        for (const decision of decisions.slice(0, limit)) {
            const row = document.createElement('div'); row.className = 'ui-suggestion writing-result-row';
            const text = document.createElement('p'); text.className = 'writing-lenses-description';
            const label = writingDecisionLabel(decision);
            text.textContent = `${label.length > 240 ? label.slice(0, 240) + '…' : label} (${writingLanguages.find(item => item.value === decision.language)?.label || decision.language})`;
            if (decision.type === 'occurrence') {
                const context = document.createElement('p'); context.className = 'writing-lenses-description';
                context.textContent = `Context: …${(decision.before || '').slice(-40)}${decision.text}${(decision.after || '').slice(0, 40)}…`;
                row.append(context);
                if (activeIds && !activeIds.includes(decision.id)) {
                    const inactive = document.createElement('p'); inactive.className = 'writing-lenses-description';
                    inactive.textContent = 'Inactive: the original occurrence can no longer be identified safely.'; row.append(inactive);
                }
            }
            const button = document.createElement('button'); button.type = 'button'; button.className = 'ui-button';
            button.textContent = decision.type === 'acronym' ? 'Review acronym again' : 'Restore suggestion';
            button.setAttribute('aria-label', `${button.textContent}: ${label}`); button.dataset.decision = decision.id;
            button.disabled = !['saved', 'save-rejected'].includes(state);
            if (state === 'saving') button.setAttribute('aria-busy', 'true');
            button.addEventListener('click', () => { void onRestore(decision.id, path).catch(() => {}); });
            row.append(text, button); list.append(row);
        }
        if (active && key) ([...list.querySelectorAll('button')].find(button => button.dataset.decision === key && !button.disabled) || toggle).focus({ preventScroll: true });
    }
    return { element, update(value, path) {
        if (owner !== path) { owner = path; expanded = false; limit = 25; }
        current = value; element.hidden = !value; render();
    } };
}
