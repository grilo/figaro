const phases = new Set(['pending', 'discovering', 'loading', 'finalizing', 'ready', 'error']);

export const vaultLoadPhaseRank = Object.freeze({
    pending: 0,
    discovering: 1,
    loading: 2,
    finalizing: 3,
    ready: 4,
    error: 4,
});

function nonNegativeInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

export function normalizeVaultLoadStatus(value = {}) {
    const phase = phases.has(value?.phase) ? value.phase : 'pending';
    const total = nonNegativeInteger(value?.total);
    const loaded = Math.min(total, nonNegativeInteger(value?.loaded));
    return {
        generation: nonNegativeInteger(value?.generation),
        phase,
        loaded,
        total,
        error: String(value?.error || '').trim(),
    };
}

export function presentVaultLoadStatus(value = {}) {
    const status = normalizeVaultLoadStatus(value);
    const totalKnown = ['loading', 'finalizing', 'ready'].includes(status.phase);
    const count = status.total > 0 || totalKnown
        ? `${status.loaded} / ${status.total} notes`
        : 'Preparing file list…';
    const percent = status.total > 0
        ? Math.round((status.loaded / status.total) * 100)
        : (['finalizing', 'ready'].includes(status.phase) ? 100 : null);

    if (status.phase === 'loading') {
        return {
            ...status,
            title: 'Loading vault',
            message: 'Reading and indexing notes…',
            count,
            percent,
            ariaText: `${status.loaded} of ${status.total} notes loaded`,
            busy: true,
        };
    }
    if (status.phase === 'finalizing') {
        return {
            ...status,
            title: 'Loading vault',
            message: 'Finalizing vault index…',
            count,
            percent,
            ariaText: `${status.loaded} of ${status.total} notes loaded; finalizing vault index`,
            busy: true,
        };
    }
    if (status.phase === 'ready') {
        return {
            ...status,
            title: 'Vault ready',
            message: 'Your notes are ready.',
            count,
            percent,
            ariaText: status.total > 0 ? `${status.total} notes loaded` : 'Vault ready',
            busy: false,
        };
    }
    if (status.phase === 'error') {
        return {
            ...status,
            title: 'Vault could not load',
            message: status.error || 'The vault index could not be built.',
            count: status.total > 0 ? count : 'Loading stopped',
            percent,
            ariaText: status.error || 'Vault loading failed',
            busy: false,
        };
    }
    return {
        ...status,
        title: 'Loading vault',
        message: 'Discovering notes…',
        count: 'Preparing file list…',
        percent: null,
        ariaText: 'Discovering notes',
        busy: true,
    };
}
