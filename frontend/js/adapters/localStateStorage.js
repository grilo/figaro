export function createLocalStateStorage(storage = null) {
    const current = () => storage || globalThis.localStorage;
    return {
        available() {
            try {
                const probe = '__figaro_storage_probe__';
                current().setItem(probe, probe);
                current().removeItem(probe);
                return true;
            } catch {
                return false;
            }
        },
        read(key) {
            return current().getItem(key);
        },
        write(key, value) {
            current().setItem(key, String(value));
        },
        remove(key) {
            current().removeItem(key);
        },
    };
}
