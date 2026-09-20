import { combineWritingProjections, writingProjectionEdit } from '../core/writingProjectionModel.js';

/** Retain one document's block maps; the Markdown adapter owns parsing/exclusions. */
export function createWritingSourceProjection({ parse, project }) {
    let previous = null, entries = [], context = '';
    let fullParses = 0, blockParses = 0, projectedBlocks = 0, reusedBlocks = 0;
    const makeEntry = (block, source, parsed) => {
        projectedBlocks++;
        return { from: block.from, to: block.to, type: block.type, source: source.slice(block.from, block.to),
            origin: block.from, projection: project(block, source, parsed) };
    };
    return {
        prepare(source) {
            if (source === previous) { reusedBlocks += entries.length; return combineWritingProjections(entries); }
            const plan = previous === null ? null : writingProjectionEdit(previous, source, entries, context);
            if (plan) {
                const text = source.slice(plan.from, plan.to), parsed = parse(text);
                blockParses++;
                const block = parsed.blocks[0];
                if (!parsed.context && parsed.blocks.length === 1 && block.type === entries[plan.index].type
                    && block.from === 0 && block.to === text.length) {
                    const replacement = { ...makeEntry(block, text, parsed), from: plan.from, to: plan.to };
                    entries = entries.map((entry, index) => index === plan.index ? replacement
                        : index > plan.index ? { ...entry, from: entry.from + plan.delta, to: entry.to + plan.delta } : entry);
                    reusedBlocks += entries.length - 1;
                    previous = source;
                    return combineWritingProjections(entries);
                }
            }
            const parsed = parse(source);
            fullParses++;
            // A structural edit still reuses exact block maps when the global
            // reference context is unchanged. Retain only the current note.
            const reusable = new Map(context === parsed.context ? entries.map(entry => [`${entry.type}\0${entry.source}`, entry]) : []);
            entries = parsed.blocks.map(block => {
                const cached = reusable.get(`${block.type}\0${source.slice(block.from, block.to)}`);
                if (!cached) return makeEntry(block, source, parsed);
                reusedBlocks++;
                return { ...cached, from: block.from, to: block.to };
            });
            context = parsed.context; previous = source;
            return combineWritingProjections(entries);
        },
        stats: () => ({ fullParses, blockParses, projectedBlocks, reusedBlocks, entries: entries.length }),
    };
}
