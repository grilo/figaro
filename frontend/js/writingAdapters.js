import { createWritingWorker } from './writingWorkerClient.js';

export function createWritingAdapters(native) {
    const session = crypto.randomUUID();
    const proseWorker = createWritingWorker({ cooperative: true });
    let proseQueue = Promise.resolve(), epoch = 0;
    const requestProse = (input, operation) => {
        const token = epoch;
        const next = proseQueue.then(() => {
            if (token !== epoch) throw new Error('Writing analysis cancelled');
            return proseWorker.analyze(input, operation);
        });
        proseQueue = next.catch(() => {}); return next;
    };
    const cancelProse = () => { epoch++; proseWorker.cancel(); };
    const retext = { analyze: source => requestProse(source), cancel: cancelProse };
    const spellingWorker = createWritingWorker({ createWorker: () => new Worker('/spelling.worker.js', { type: 'module' }), cooperative: true });
    const decisionWorker = createWritingWorker({ createWorker: () => new Worker('/decisions.worker.js', { type: 'module' }) });
    // Decision jobs are ordered across documents; analysis may be superseded.
    let decisionQueue = Promise.resolve();
    const trackDecisions = input => {
        const next = decisionQueue.then(() => decisionWorker.analyze(input, 'decisions'));
        decisionQueue = next.catch(() => {}); return next;
    };
    const spelling = (source, language) => spellingWorker.analyze(source, language);
    spelling.cancel = () => spellingWorker.cancel();
    let initialization = native.WritingInitialize();
    initialization.catch(() => {});
    const cancelled = new Set();
    const vale = {
        async analyze(id, text) { await initialization; if (cancelled.has(id)) throw new Error('Writing analysis cancelled'); return native.WritingAnalyze(`${session}:${id}`, text); },
        cancel(id) { cancelled.add(id); if (cancelled.size > 128) cancelled.delete(cancelled.values().next().value); void native.WritingCancel(`${session}:${id}`).catch(() => {}); },
        retry() { initialization = native.WritingInitialize(); initialization.catch(() => {}); },
    };
    return {
        retext, vale, spelling, trackDecisions,
        review: { resolve: input => requestProse(input, 'resolve'), cancel: cancelProse },
        ready: Promise.allSettled([proseWorker.ready, spellingWorker.ready, decisionWorker.ready, initialization]),
        destroy() { proseWorker.destroy(); spellingWorker.destroy(); decisionWorker.destroy(); },
    };
}
