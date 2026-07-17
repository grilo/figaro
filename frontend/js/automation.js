let autoCommitMode = 3600;

export function setAutoCommitMode(seconds) {
    const parsed = Number(seconds);
    autoCommitMode = Number.isFinite(parsed) ? parsed : 3600;
}

export function getAutoCommitMode() {
    return autoCommitMode;
}

export function shouldCommitOnSave() {
    return autoCommitMode === -1;
}

