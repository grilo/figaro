/** Keep primary choices and Ignore visible; disclose further replacements on demand. */
export function limitWritingAlternatives(actions, buttons) {
    if (buttons.length <= 2) return;
    const extra = buttons.slice(2);
    extra.forEach(button => { button.hidden = true; });
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'ui-button';
    toggle.textContent = `More alternatives (${extra.length})`; toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        extra.forEach(button => { button.hidden = !expanded; });
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.textContent = expanded ? 'Fewer alternatives' : `More alternatives (${extra.length})`;
        if (expanded) extra[0].focus();
    });
    actions.append(toggle);
}
