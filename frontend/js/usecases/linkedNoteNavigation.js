import { linkedNoteCreationPlan, linkedNoteNavigationPlan, linkedNoteTabAction } from '../core/linkedNoteNavigationModel.js';
import { reviewMissingLinkedNote } from './similarNoteReview.js';

/**
 * Ports own file I/O, current workspace snapshots, tab effects, dialogs, editor
 * target replacement/heading navigation, the clock, and logging. Resolve live
 * state through getters so an awaited read does not freeze tab ownership.
 */
export function createLinkedNoteNavigation(ports) {
    async function openTarget(id, title, type, data, replaceCurrent) {
        const action = linkedNoteTabAction(replaceCurrent, ports.getTabs(), id);
        if (action === 'replace') await ports.replaceTab(id, title, type, data);
        else ports.openTab(id, title, type, data);
    }

    async function openNote(path, file, replaceCurrent) {
        await openTarget(path, path.split('/').pop(), 'file', { path, mtime: file?.mtime }, replaceCurrent);
    }

    return async function navigate(target, label, replaceCurrent = false, linkEdit = null) {
        const plan = linkedNoteNavigationPlan(target, label);
        if (plan.kind === 'heading') { ports.navigateHeading(plan.path); return true; }
        if (plan.kind === 'none') return true;
        if (plan.kind === 'calendar') {
            await openTarget(plan.id, plan.title, 'calendar', plan.data, replaceCurrent);
            return true;
        }
        const path = plan.path;
        try {
            ports.log.debug('handleLinkClick: reading', path);
            const file = await ports.read(path);
            ports.log.debug('handleLinkClick: read_file result for', path, ':', file ? 'found' : 'not found');
            if (file?.issue) { ports.reportIssue(file.issue, path); return; }
            if (file) { await openNote(path, file, replaceCurrent); return; }
            const creation = linkedNoteCreationPlan(path);
            let confirmed = false;
            if (linkEdit) {
                const review = await reviewMissingLinkedNote({
                    tree: ports.getTree(), targetPath: creation.path, confirm: ports.confirm,
                    read: ports.read,
                    replaceTarget: existing => ports.replaceTarget(linkEdit, existing),
                    open: (existing, result) => openNote(existing, result, replaceCurrent),
                });
                if (review === 'used-existing' || review === 'cancelled') return;
                if (review === 'stale') {
                    await ports.error('Link changed', 'The link changed while the note choice was open.', 'Nothing was replaced. Try the link again.');
                    return;
                }
                if (review === 'unavailable') {
                    await ports.error('Couldn’t open existing note', 'The similar note is no longer available.', 'Nothing was replaced. Refresh the file tree and try again.');
                    return;
                }
                confirmed = review === 'create';
            }
            if (!confirmed) confirmed = await ports.confirm('Create this note?', creation.message, false, false, {
                icon: 'file-add', confirmLabel: 'Create note',
            });
            if (!confirmed) return;
            const created = await ports.create(creation.path, creation.content);
            if (!created?.success) {
                await ports.error('Couldn’t create note', created?.error, 'The linked note could not be created.');
                return;
            }
            ports.openTab(creation.path, creation.title, 'file', {
                path: creation.path, mtime: created.mtime || ports.now(),
            }, true);
            await ports.refreshTree();
        } catch (error) {
            ports.log.error('Failed to open link:', error, 'path was:', path);
            await ports.error('Couldn’t open linked note', error, `Couldn’t open “${path}”. Try the link again.`);
        }
    };
}
