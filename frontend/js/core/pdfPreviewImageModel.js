function normalizeVaultPath(value, baseDirectory = '') {
    const source = String(value || '').trim().replaceAll('\\', '/');
    if (!source || source.startsWith('/') || source.startsWith('//') || /^[A-Za-z]:/.test(source)
        || source.includes('://') || /^file:/i.test(source)) return '';

    const parts = String(baseDirectory || '').split('/').filter(Boolean);
    for (const segment of source.split('/')) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            if (!parts.length) return '';
            parts.pop();
            continue;
        }
        parts.push(segment);
    }
    return parts.join('/');
}

function parentDirectory(path) {
    const normalized = String(path || '').replaceAll('\\', '/');
    const separator = normalized.lastIndexOf('/');
    return separator < 0 ? '' : normalized.slice(0, separator);
}

function passthrough(source) {
    return { kind: 'passthrough', source };
}

/** Plan one printable image source without touching the DOM or browser URL state. */
export function planPDFPreviewImageSource(notePath, source) {
    const raw = String(source || '').trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('//')
        || /^(?:data|blob):/i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return passthrough(raw);

    const suffixIndex = raw.search(/[?#]/);
    const rawPath = suffixIndex < 0 ? raw : raw.slice(0, suffixIndex);
    const suffix = suffixIndex < 0 ? '' : raw.slice(suffixIndex);
    const explicitVaultPath = rawPath.startsWith('/vault/');
    const vaultRootPath = explicitVaultPath || rawPath.startsWith('/');
    const encodedPath = explicitVaultPath ? rawPath.slice('/vault/'.length) : rawPath.replace(/^\/+/, '');

    let decodedPath;
    try {
        decodedPath = decodeURIComponent(encodedPath);
    } catch (_) {
        return passthrough(raw);
    }

    const path = normalizeVaultPath(decodedPath, vaultRootPath ? '' : parentDirectory(notePath));
    return path ? { kind: 'vault', path, suffix } : passthrough(raw);
}
