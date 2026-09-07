import { writingSuggestionExamples } from '../core/writingSuggestionModel.js';

/** Shared readable examples for inline and sidebar suggestions. */
export function createWritingExamplesView(finding) {
    // Show one concrete comparison; the action labels expose the other choices.
    return createWritingExampleList(writingSuggestionExamples(finding).slice(0, 1));
}

/** Illustrative comparisons share presentation without offering editing actions. */
export function createWritingExampleList(examples) {
    const list = document.createElement('div'); list.className = 'writing-examples';
    for (const example of examples) {
        const item = document.createElement('div'); item.className = 'writing-example';
        const label = document.createElement('strong'); label.textContent = example.label;
        const before = document.createElement('p'); before.textContent = `Before: ${example.before}`;
        const after = document.createElement('p'); after.textContent = `After: ${example.after}`;
        item.append(label, before, after); list.append(item);
    }
    list.hidden = !list.childElementCount;
    return list;
}
