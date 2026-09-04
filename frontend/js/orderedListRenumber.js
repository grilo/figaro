import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { orderedListRenumberChanges } from './core/orderedListRenumberModel.js';

function orderedListItemMarker(item, doc) {
    const prefix = doc.sliceString(item.from, Math.min(item.to, item.from + 32));
    const match = /^([ \t]*)(\d+)(?=[.)])/.exec(prefix);
    if (!match) return null;
    return {
        from: item.from + match[1].length,
        to: item.from + match[1].length + match[2].length,
        number: Number(match[2]),
    };
}

function directOrderedListItems(list, doc) {
    const items = [];
    for (let node = list.firstChild; node; node = node.nextSibling) {
        if (node.name !== 'ListItem') continue;
        const marker = orderedListItemMarker(node, doc);
        if (marker) items.push(marker);
    }
    return items;
}

function orderedListAncestor(node) {
    for (let current = node; current; current = current.parent) {
        if (current.name === 'OrderedList') return current;
    }
    return null;
}

function orderedListAt(tree, position, documentLength) {
    const bounded = Math.max(0, Math.min(documentLength, position));
    for (const bias of [1, -1]) {
        const list = orderedListAncestor(tree.resolveInner(bounded, bias));
        if (list) return list;
    }
    return null;
}

function affectedOrderedLists(transaction) {
    const oldDocument = transaction.startState.doc;
    const oldTree = syntaxTree(transaction.startState);
    const affected = new Map();

    transaction.changes.iterChangedRanges((fromA, toA) => {
        if (toA <= fromA) return;
        oldTree.iterate({
            from: Math.max(0, fromA - 1),
            to: Math.min(oldDocument.length, toA + 1),
            enter: reference => {
                if (reference.name !== 'ListItem' || reference.node.parent?.name !== 'OrderedList') return;
                const marker = orderedListItemMarker(reference.node, oldDocument);
                if (!marker || fromA >= marker.to || toA <= marker.from) return;
                const list = reference.node.parent;
                const firstMarker = directOrderedListItems(list, oldDocument)[0];
                if (!firstMarker) return;
                affected.set(`${list.from}:${list.to}`, {
                    mappedStart: transaction.changes.mapPos(list.from, 1),
                    startNumber: firstMarker.number,
                });
            },
        });
    });
    return [...affected.values()];
}

export const orderedListRenumberExtension = EditorState.transactionFilter.of(transaction => {
    if (!transaction.docChanged || !transaction.isUserEvent('delete')) return transaction;

    const affected = affectedOrderedLists(transaction);
    if (affected.length === 0) return transaction;

    const newDocument = transaction.newDoc;
    const newTree = syntaxTree(transaction.state);
    const lists = new Map();
    for (const target of affected) {
        const list = orderedListAt(newTree, target.mappedStart, newDocument.length);
        if (list) lists.set(`${list.from}:${list.to}`, { list, startNumber: target.startNumber });
    }

    const changes = [...lists.values()]
        .flatMap(({ list, startNumber }) => orderedListRenumberChanges(
            directOrderedListItems(list, newDocument),
            startNumber,
        ))
        .sort((left, right) => left.from - right.from);
    return changes.length === 0
        ? transaction
        : [transaction, { changes, sequential: true }];
});
