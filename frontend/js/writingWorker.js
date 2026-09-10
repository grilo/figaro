import { analyzeWriting, writingRuntimeReady } from '../vendored/writing/runtime.js';
import { createWritingProse } from './usecases/writingProse.js';
import { createWritingWorkerCheckpoint } from './writingWorkerCheckpoint.js';

const prose = createWritingProse({ analyze: analyzeWriting });
let cancelledThrough = 0;
self.addEventListener('message', async event => {
    if (event.data.cancel !== undefined) { cancelledThrough = Math.max(cancelledThrough, event.data.cancel); return; }
    const { id, source, language } = event.data;
    try {
        const checkpoint = createWritingWorkerCheckpoint(() => id <= cancelledThrough);
        const options = { checkpoint };
        const result = language === 'resolve' ? await prose.resolve(source, options) : await prose.analyze(source, options);
        await checkpoint();
        self.postMessage({ id, result });
    } catch (error) { self.postMessage({ id, error: String(error?.message || error) }); }
});
writingRuntimeReady.then(() => self.postMessage({ ready: true }), error => self.postMessage({ initializationError: String(error?.message || error) }));
