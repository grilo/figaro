import { todayNotePlan } from '../core/homeModel.js';

export function createOpenTodayNote({ getTodayPath, getTree, createFile, openFile, afterCreate = () => {} }) {
    if (![getTodayPath, getTree, createFile, openFile].every(port => typeof port === 'function')) {
        throw new TypeError('Open-today-note ports are required');
    }

    return async function openTodayNote() {
        const today = String(await getTodayPath() || '');
        const path = today.endsWith('.md') ? today : `${today}.md`;
        const plan = todayNotePlan(path, getTree());
        if (plan.kind === 'invalid') throw new Error(plan.error);
        if (plan.kind === 'open') {
            await openFile({ path: plan.path, mtime: plan.mtime, created: false });
            return { success: true, path: plan.path, created: false };
        }

        const result = await createFile(plan.path, plan.content);
        if (result?.success) {
            await afterCreate(result.path || plan.path);
            await openFile({ path: result.path || plan.path, mtime: result.mtime, created: true });
            return { success: true, path: result.path || plan.path, created: true };
        }

        if (/already exists/i.test(String(result?.error || ''))) {
            await afterCreate(plan.path);
            await openFile({ path: plan.path, created: false });
            return { success: true, path: plan.path, created: false, collision: true };
        }
        throw new Error(result?.error || 'Could not create today’s note.');
    };
}

export default { createOpenTodayNote };
