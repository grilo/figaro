import { analyzeWriting, writingRuntimeReady } from '../vendored/writing/runtime.js';
import { createWritingProse } from './usecases/writingProse.js';

const prose = createWritingProse({ analyze: analyzeWriting });
self.addEventListener('message', async event => {
    const { id, source, language } = event.data;
    try {
        const result = language === 'resolve' ? await prose.resolve(source) : await prose.analyze(source);
        self.postMessage({ id, result });
    } catch (error) { self.postMessage({ id, error: String(error?.message || error) }); }
});
writingRuntimeReady.then(() => self.postMessage({ ready: true }), error => self.postMessage({ initializationError: String(error?.message || error) }));
