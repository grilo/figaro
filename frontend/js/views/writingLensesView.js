import { writingLensGroups, writingLensGroupState, writingLanguages, writingLensDisabledReason, writingLensesAvailability, supportedWritingLenses, writingLensesExpansion } from '../core/writingLensesModel.js';
import { enhanceSelectCombobox } from '../selectCombobox.js';
import { setTooltip } from '../tooltip.js';
import { createDisclosure } from '../disclosure.js';
import { infoIcon } from '../icons.js';
import { writingLensHelp } from '../core/writingLensHelpModel.js';
import { createWritingLensHelpView } from './writingLensHelpView.js';

/** The pane and Pure picker share the Settings combobox and approved controls. */
export function createWritingLensesView({ id = 'writing-lenses', onChange, onRetry, onApplyAll, compact = true, onLayout = () => {} }) {
    const element = document.createElement('section');
    element.className = 'writing-lenses-controls';
    element.setAttribute('aria-label', 'Writing lens preferences');
    element.innerHTML = `
        <div class="writing-lenses-field"><label for="${id}-language">Analysis language</label>
            <select id="${id}-language" aria-label="Analysis language">
                ${writingLanguages.map(language => `<option value="${language.value}">${language.label}</option>`).join('')}
            </select>
        </div>
        <fieldset class="writing-lenses-layers"><legend>Lenses</legend>
            ${writingLensGroups.map(lens => `<div><div class="writing-lenses-row"><label class="writing-lenses-layer"><input class="ui-checkbox" type="checkbox" value="${lens.id}" aria-describedby="${id}-availability ${id}-${lens.id}-description"><span>${lens.label}</span><span class="ui-badge" data-partial hidden>Partial</span></label><button type="button" class="ui-icon-button" data-lens-help="${lens.id}" aria-label="About ${lens.label}" aria-haspopup="dialog" aria-expanded="false" aria-controls="${id}-help"><span aria-hidden="true">${infoIcon()}</span></button></div><p class="writing-lenses-description" id="${id}-${lens.id}-description">${lens.description}</p></div>`).join('')}
        </fieldset>
        <section class="writing-lenses-review" aria-label="Analysis availability">
            <h3 data-review-title></h3><p id="${id}-availability" data-review-detail></p>
        </section>
        <div class="writing-lenses-persistence" role="status" aria-live="polite"><span data-save-status></span></div>
        <button type="button" class="ui-button" data-apply-all>Apply to all documents</button>
        <button type="button" class="ui-button" data-retry hidden>Retry</button>`;
    const select = element.querySelector('select');
    const picker = enhanceSelectCombobox(select, { className: 'ui-picker--quiet' });
    const help = createWritingLensHelpView({ id: `${id}-help` });
    element.append(help.element);
    let snapshot = { preferences: { language: 'none', lenses: [] }, status: 'loading' };
    element.querySelectorAll('[data-lens-help]').forEach(button => {
        setTooltip(button, button.getAttribute('aria-label'));
        button.addEventListener('click', () => { picker.close(); help.toggle(button, writingLensHelp(button.dataset.lensHelp, snapshot)); });
    });
    const choices = element.querySelector('fieldset');
    let expansion;
    const location = choices.nextSibling;
    const disclosure = createDisclosure({ id: `${id}-choices`, label: 'Lenses', content: choices,
        expanded: !compact, onChange(value) { if (!value) help.close(); expansion = { ...expansion, expanded: value }; onLayout(); } });
    element.insertBefore(disclosure.element, location);
    disclosure.trigger.dataset.configure = '';
    disclosure.trigger.hidden = !compact;
    choices.querySelector('legend').hidden = compact;
    select.addEventListener('change', () => onChange({ type: 'language', value: select.value }));
    element.addEventListener('change', event => {
        if (event.target.matches('input[type="checkbox"]')) onChange({ type: 'lens', value: event.target.value, enabled: event.target.checked });
    });
    element.querySelector('[data-retry]').addEventListener('click', onRetry);
    const apply = element.querySelector('[data-apply-all]');
    apply.addEventListener('click', () => onApplyAll?.());
    return {
        element,
        focus() {
            if (!picker.trigger.disabled) picker.trigger.focus();
            else if (!element.querySelector('[data-retry]').hidden) element.querySelector('[data-retry]').focus();
        },
        close() { picker.close(); help.close(); },
        destroy() { picker.destroy(); disclosure.destroy(); help.destroy(); },
        contains(target) { return element.contains(target) || picker.menu.contains(target) || help.element.contains(target); },
        update({ preferences, status, error, applying = false, applyError = '', documentKey }) {
            preferences = supportedWritingLenses(preferences);
            if (snapshot.documentKey !== documentKey) help.close();
            snapshot = { preferences, status, applying, documentKey };
            if (help.opener) help.update(writingLensHelp(help.opener.dataset.lensHelp, snapshot));
            expansion = writingLensesExpansion(expansion, { documentKey, status, hasSelection: preferences.lenses.length > 0 });
            disclosure.setSummary(`${writingLensGroups.filter(lens => writingLensGroupState(lens.id, preferences).selected).length} selected`);
            disclosure.setExpanded(!compact || expansion.expanded);
            const disabled = applying || status === 'loading' || status === 'load-error';
            select.value = preferences.language;
            picker.sync(); picker.setDisabled(disabled, { busy: applying || status === 'loading' });
            element.querySelectorAll('input[type="checkbox"]').forEach(input => {
                const reason = writingLensDisabledReason(input.value, { language: preferences.language, status, applying });
                const state = writingLensGroupState(input.value, preferences);
                input.checked = state.checked;
                input.indeterminate = state.partial;
                input.closest('label').querySelector('[data-partial]').hidden = !state.partial;
                input.disabled = Boolean(reason);
                const description = state.description;
                element.querySelector(`#${id}-${input.value}-description`).textContent = description;
                const explanation = reason || state.detail || description;
                setTooltip(input, explanation);
                input.setAttribute('aria-description', explanation);
            });
            const availability = writingLensesAvailability(preferences);
            element.querySelector('.writing-lenses-review').hidden = preferences.language.startsWith('en-') && preferences.lenses.length > 0;
            element.querySelector('[data-review-title]').textContent = availability.title;
            element.querySelector('[data-review-detail]').textContent = availability.detail;
            error = applyError || error;
            element.querySelector('[data-save-status]').textContent = error || (applying ? 'Applying choices to all documents…' : { loading: 'Loading preferences…', saving: 'Saving preferences…', saved: 'Choices saved for this document.' }[status] || '');
            element.querySelector('.writing-lenses-persistence').classList.toggle('ui-notice', Boolean(error));
            element.querySelector('.writing-lenses-persistence').classList.toggle('ui-notice--warning', Boolean(error));
            element.querySelector('[data-retry]').hidden = !error;
            element.querySelector('[data-retry]').disabled = applying;
            apply.disabled = disabled;
            apply.setAttribute('aria-busy', String(applying));
        },
    };
}
