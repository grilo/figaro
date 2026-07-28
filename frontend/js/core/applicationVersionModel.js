export function applicationVersionPresentation(value) {
    const version = typeof value === 'string' ? value.trim() : '';
    if (!version) {
        return {
            text: 'Unavailable',
            state: 'error',
        };
    }
    return {
        text: version,
        state: 'ready',
    };
}
