import { writingSuggestionExplanation } from '../core/writingSuggestionModel.js';

/** Author guidance comes first; raw evidence is created only on explicit request. */
export function createWritingDetailsView(finding) {
    const element = document.createElement('div'); element.className = 'writing-details';
    const explanation = document.createElement('p'); explanation.className = 'writing-lenses-description';
    explanation.textContent = writingSuggestionExplanation(finding);
    const evidence = document.createElement('pre'); evidence.className = 'writing-result-evidence'; evidence.hidden = true;
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'ui-button';
    toggle.textContent = 'Technical diagnostics'; toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
        evidence.hidden = !evidence.hidden;
        if (!evidence.hidden && !evidence.textContent) evidence.textContent = JSON.stringify({ kind: finding.kind, range: [finding.from, finding.to], sources: finding.sources }, null, 2);
        toggle.setAttribute('aria-expanded', String(!evidence.hidden));
    });
    element.append(explanation, toggle, evidence); return element;
}
