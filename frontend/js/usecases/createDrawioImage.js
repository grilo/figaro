/** Coordinate creation of a Draw.io asset referenced by the active Markdown note. */
export async function createDrawioImage({
    target,
    createFile,
    refreshTree,
    openDiagram,
    reportRefreshFailure = () => {},
}) {
    if (!target?.path || !target?.title) return { kind: 'invalid' };
    if (![createFile, refreshTree, openDiagram].every(port => typeof port === 'function')) {
        throw new TypeError('Draw.io image creation requires file, tree, and tab ports');
    }

    let created;
    try {
        created = await createFile(target.path, '');
    } catch (error) {
        return { kind: 'failed', error };
    }
    if (!created?.success) return { kind: 'failed', error: created?.error };

    const diagram = {
        path: created.path || target.path,
        title: target.title,
        mtime: created.mtime,
    };
    try {
        await openDiagram(diagram);
    } catch (error) {
        refreshWithoutBlocking(refreshTree, reportRefreshFailure);
        return { kind: 'created-open-failed', path: diagram.path, error };
    }
    refreshWithoutBlocking(refreshTree, reportRefreshFailure);
    return { kind: 'created', path: diagram.path };
}

function refreshWithoutBlocking(refreshTree, reportFailure) {
    const reportSafely = error => {
        try {
            reportFailure(error);
        } catch {
            // A background-reporting adapter must not resurrect the completed action.
        }
    };
    try {
        Promise.resolve(refreshTree()).catch(reportSafely);
    } catch (error) {
        reportSafely(error);
    }
}
