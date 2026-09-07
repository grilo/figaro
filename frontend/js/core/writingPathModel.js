/** Collision-specific merge destinations take precedence over the folder move. */
export function movedWritingPath(path, result) {
    if (!result?.success) return path;
    const mappings = [...Object.entries(result.moved_paths || {}), [result.old_path, result.path]]
        .filter(([from, to]) => typeof from === 'string' && from && typeof to === 'string' && to)
        .sort(([a], [b]) => b.length - a.length);
    for (const [from, to] of mappings) {
        if (path === from || path.startsWith(`${from}/`)) return to + path.slice(from.length);
    }
    return path;
}
