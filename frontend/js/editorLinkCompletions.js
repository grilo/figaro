import { ViewPlugin } from '@codemirror/view';
import { startCompletion } from '@codemirror/autocomplete';
import { isHashtagCompletionTrigger } from './core/taskDueDateCompletionModel.js';
import {
    headingLinkCompletionMatch,
    markdownHeadingTargets,
    noteLinkCompletion,
    noteLinkCompletionMatch,
    planLinkedNoteCompletion,
    shouldOfferLinkedNoteCreation,
} from './linkCompletions.js';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);

function collectFiles(items, select, result = []) {
    for (const item of items || []) {
        if (item.type === 'file') {
            const selected = select(item);
            if (selected) result.push(selected);
        }
        if (item.type === 'directory' && item.children) {
            collectFiles(item.children, select, result);
        }
    }
    return result;
}

function inputCompletionActivator(matches) {
    return ViewPlugin.fromClass(class {
        update(update) {
            if (!update.docChanged || !update.state.selection.main.empty) return;
            const typed = update.transactions.some(transaction => transaction.isUserEvent?.('input.type'));
            if (!typed) return;
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            if (!matches(update.state.doc.sliceString(line.from, head))) return;
            queueMicrotask(() => {
                if (!update.view.isDestroyed) startCompletion(update.view);
            });
        }
    });
}

export function createEditorLinkCompletions({
    getFileTree,
    searchNotes,
    getActiveTab,
    getLinkStyle,
    createLinkedNote,
}) {
    const required = { getFileTree, searchNotes, getActiveTab, getLinkStyle, createLinkedNote };
    if (Object.values(required).some(port => typeof port !== 'function')) {
        throw new TypeError('Editor link-completion ports are incomplete');
    }

    const imageCompletions = context => {
        const position = context.pos;
        const line = context.state.doc.lineAt(position);
        const before = context.state.doc.sliceString(line.from, position);
        const match = before.match(/!\[([^\]]*)$/);
        if (!match) return null;

        const prefix = match[1].toLowerCase();
        const files = collectFiles(getFileTree(), item => {
            const extension = item.name.split('.').pop().toLowerCase();
            return IMAGE_EXTENSIONS.has(extension)
                ? { name: item.name, path: item.path, mtime: item.mtime || 0 }
                : null;
        }).sort((a, b) => b.mtime - a.mtime);
        if (!files.length) return null;

        const options = files
            .filter(file => file.name.toLowerCase().startsWith(prefix)
                || file.path.toLowerCase().includes(prefix))
            .slice(0, 10)
            .map(file => ({
                label: file.name,
                detail: file.path,
                apply: (view, _completion, from, to) => {
                    const encodedPath = file.path.replace(/ /g, '%20');
                    const replacement = `![${file.name}](${encodedPath})`;
                    view.dispatch({
                        changes: { from, to, insert: replacement },
                        selection: { anchor: from + replacement.length },
                    });
                },
            }));
        return { from: line.from + match.index, options, filter: false };
    };

    const fileLinkCompletions = async context => {
        const position = context.pos;
        const line = context.state.doc.lineAt(position);
        const before = context.state.doc.sliceString(line.from, position);
        const match = noteLinkCompletionMatch(before);
        if (!match) return null;

        const prefix = match.prefix.toLowerCase();
        const files = collectFiles(getFileTree(), item => item.name.endsWith('.md')
            ? { name: item.name.replace('.md', ''), path: item.path, mtime: item.mtime || 0 }
            : null).sort((a, b) => b.mtime - a.mtime);
        let matches = files.slice(0, 10);
        if (match.prefix) {
            try {
                const response = await searchNotes(match.prefix, {
                    case_sensitive: false,
                    title_only: false,
                    profile: 'links',
                    limit: 10,
                    suggest: false,
                });
                matches = (response?.results || []).map(file => ({
                    name: String(file.name || file.path?.split('/').pop() || file.path || '')
                        .replace(/\.md$/i, ''),
                    path: file.path,
                    mtime: file.mtime || 0,
                })).filter(file => file.path);
            } catch {
                matches = files
                    .filter(file => file.name.toLowerCase().startsWith(prefix)
                        || file.path.toLowerCase().startsWith(prefix))
                    .slice(0, 10);
            }
        }

        const options = matches.map(file => ({
            label: file.name,
            detail: file.path,
            apply: (view, _completion, from, to) => {
                const replacement = noteLinkCompletion(getLinkStyle(), file);
                view.dispatch({
                    changes: { from, to, insert: replacement },
                    selection: { anchor: from + replacement.length },
                });
            },
        }));
        const activeTab = getActiveTab();
        const creationPlan = planLinkedNoteCompletion({
            label: match.prefix,
            currentPath: activeTab?.type === 'file' ? activeTab.path : '',
            style: getLinkStyle(),
        });
        if (shouldOfferLinkedNoteCreation(creationPlan, files)) {
            options.push({
                label: `Create “${creationPlan.label}”`,
                detail: `New note · ${creationPlan.path}`,
                type: 'text',
                boost: -100,
                apply: (view, _completion, from, to) => {
                    const request = {
                        from,
                        to,
                        expectedSource: view.state.doc.sliceString(from, to),
                    };
                    void createLinkedNote(view, request, creationPlan);
                },
            });
        }
        if (!options.length) return null;
        return { from: line.from + match.fromOffset, options, filter: false };
    };

    const headingLinkCompletions = context => {
        const position = context.pos;
        const line = context.state.doc.lineAt(position);
        const match = headingLinkCompletionMatch(
            context.state.doc.sliceString(line.from, position),
        );
        if (!match) return null;

        const prefix = match.prefix.toLowerCase();
        const targets = markdownHeadingTargets(context.state.doc.toString())
            .filter(target => target.slug.startsWith(prefix)
                || target.label.toLowerCase().includes(prefix))
            .slice(0, 20);
        if (!targets.length) return null;

        return {
            from: line.from + match.fromOffset,
            filter: false,
            options: targets.map(target => ({
                label: target.label,
                detail: `#${target.slug}`,
                apply: (view, _completion, from, to) => {
                    const hasClosingParenthesis = view.state.doc.sliceString(to, to + 1) === ')';
                    const insert = `#${target.slug}${hasClosingParenthesis ? '' : ')'}`;
                    view.dispatch({
                        changes: { from, to, insert },
                        selection: { anchor: from + insert.length },
                    });
                },
            })),
        };
    };

    return {
        imageCompletions,
        fileLinkCompletions,
        headingLinkCompletions,
        headingLinkCompletionActivator: inputCompletionActivator(headingLinkCompletionMatch),
        hashtagCompletionActivator: inputCompletionActivator(isHashtagCompletionTrigger),
    };
}
