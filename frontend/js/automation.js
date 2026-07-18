let autoCommitEnabled = true;

export function setAutoCommitEnabled(enabled) {
    autoCommitEnabled = Boolean(enabled);
}

export function getAutoCommitEnabled() {
    return autoCommitEnabled;
}

export function shouldCommitOnSave() {
    return autoCommitEnabled;
}
