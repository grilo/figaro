import themeManifest from '../themes/manifest.json';
import { initDesignSystemCatalog } from './catalog.js';

if (typeof document !== 'undefined' && document.documentElement.dataset.page === 'design-system-catalog') {
    initDesignSystemCatalog({ themeManifest });
}
