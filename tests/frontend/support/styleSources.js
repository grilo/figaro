import fs from 'node:fs';
import path from 'node:path';

const styleManifest = JSON.parse(
    fs.readFileSync(path.resolve('frontend/design-system/style-manifest.json'), 'utf8'),
);

export const applicationStylePaths = Object.freeze(
    styleManifest.eagerStylesheets.map(stylesheet => `frontend/${stylesheet}`),
);

export function readApplicationStyles() {
    return applicationStylePaths
        .map(stylesheet => fs.readFileSync(path.resolve(stylesheet), 'utf8'))
        .join('\n');
}
