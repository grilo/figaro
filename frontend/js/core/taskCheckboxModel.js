function plainTaskText(lineText) {
    return String(lineText || '')
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s*/, '')
        .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, '$1')
        .replace(/[`*_~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function taskCheckboxReplacement(checked) {
    return checked ? ' ' : 'x';
}

export function taskCheckboxLabel(lineText, checked) {
    const task = plainTaskText(lineText);
    const action = checked ? 'incomplete' : 'complete';
    return task ? `Mark “${task}” ${action}` : `Mark task ${action}`;
}
