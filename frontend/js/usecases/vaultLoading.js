import {
    normalizeVaultLoadStatus,
    presentVaultLoadStatus,
    vaultLoadPhaseRank,
} from '../core/vaultLoadingModel.js';

// Coordinates the event stream with a status snapshot. The generation and
// phase guards close the subscribe/read race without coupling that policy to
// Wails events or DOM state.
export function createVaultLoadingSession({ readStatus, present, remove }) {
    let active = true;
    let latest = normalizeVaultLoadStatus();
    let settle = null;
    const settled = new Promise(resolve => { settle = resolve; });

    const settleIfComplete = () => {
        if (latest.phase === 'ready' || latest.phase === 'error') settle?.(latest);
    };

    const update = value => {
        if (!active) return false;
        const next = normalizeVaultLoadStatus(value);
        if (next.generation < latest.generation) return false;
        if (next.generation === latest.generation) {
            if (vaultLoadPhaseRank[next.phase] < vaultLoadPhaseRank[latest.phase]) return false;
            if (next.phase === latest.phase && next.loaded < latest.loaded) return false;
        }
        latest = next;
        present(presentVaultLoadStatus(next));
        settleIfComplete();
        return true;
    };

    return {
        start() {
            present(presentVaultLoadStatus(latest));
        },
        update,
        async connect() {
            try {
                update(await readStatus());
            } catch (_) {
                // The static discovery state remains useful if a development
                // or older test backend does not expose the snapshot yet.
            }
        },
        waitUntilSettled() {
            settleIfComplete();
            return settled;
        },
        finish() {
            if (!active) return false;
            active = false;
            remove();
            return true;
        },
    };
}
