/**
 * Title-bar Markdown and Figaro-macro help.
 *
 * This DOM adapter owns popup disclosure, focus return, and the accessible
 * two-topic tablist. The help content remains ordinary static HTML so it is
 * available immediately at startup and easy to audit against editor syntax.
 */

export function initHelpPopup(root = document) {
    const trigger = root.getElementById('md-cheatsheet-trigger');
    const popup = root.getElementById('md-cheatsheet-popup');
    const close = root.getElementById('md-cheatsheet-close');
    const wrapper = trigger?.closest('.md-cheatsheet-wrapper');
    if (!trigger || !popup || !wrapper || trigger.dataset.initialized === 'true') return;

    trigger.dataset.initialized = 'true';
    const tabs = [...popup.querySelectorAll('[role="tab"]')];
    const panels = [...popup.querySelectorAll('[role="tabpanel"]')];

    const activateTab = (target, { focus = false } = {}) => {
        if (!target || !tabs.includes(target)) return;
        for (const tab of tabs) {
            const selected = tab === target;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            tab.classList.toggle('ui-button--accent', selected);
        }
        for (const panel of panels) {
            panel.hidden = panel.id !== target.getAttribute('aria-controls');
        }
        if (focus) target.focus();
    };

    const selectedTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0];
    activateTab(selectedTab);

    for (const tab of tabs) {
        tab.addEventListener('click', event => {
            event.stopPropagation();
            activateTab(tab);
        });
    }

    const tablist = popup.querySelector('[role="tablist"]');
    tablist?.addEventListener('keydown', event => {
        const current = event.target.closest?.('[role="tab"]');
        const index = tabs.indexOf(current);
        if (index < 0) return;

        let nextIndex = null;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (nextIndex === null) return;

        event.preventDefault();
        event.stopPropagation();
        activateTab(tabs[nextIndex], { focus: true });
    });

    const setOpen = (open, { restoreFocus = false } = {}) => {
        const changed = popup.classList.contains('open') !== open;
        popup.classList.toggle('open', open);
        popup.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
        if (!open && restoreFocus && changed) trigger.focus();
    };

    trigger.addEventListener('click', event => {
        event.stopPropagation();
        const open = !popup.classList.contains('open');
        setOpen(open);
        if (open) {
            setTimeout(() => {
                const activeTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
                (activeTab || close)?.focus();
            }, 0);
        }
    });
    wrapper.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !popup.classList.contains('open')) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false, { restoreFocus: true });
    });
    wrapper.addEventListener('focusout', event => {
        if (!popup.classList.contains('open') || wrapper.contains(event.relatedTarget)) return;
        setOpen(false);
    });
    close?.addEventListener('click', event => {
        event.stopPropagation();
        setOpen(false, { restoreFocus: true });
    });
    root.addEventListener('click', event => {
        if (!event.target.closest('.md-cheatsheet-wrapper')) setOpen(false);
    });

    // The popup starts hidden even in test fixtures that omit the attribute.
    setOpen(false);
}

export default { initHelpPopup };
