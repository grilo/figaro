import { selectedWritingLenses, validateWritingFix } from '../core/writingAnalysisModel.js';
import { writingLensSupportsLanguage } from '../core/writingLensesModel.js';
import { planWritingBulkFix } from '../core/writingReviewModel.js';

/** Own one active snapshot and its bounded latest replacement through injected effects. */
export function createWritingAnalysis({ retext, vale, spelling, review, schedule, unschedule, onChange = () => {} }) {
    let current = null, analyzed = null, generation = 0, timer = null, disposed = false;
    let running = false, pending = false, force = false;
    let projection, observations = [], spellings = [], valeOutput, states = {};
    let resolution = 0, resolutionQueue = Promise.resolve(), identitySource, resultVersion = 0;
    let identities = [], nextIdentity = 0;
    const empty = () => ({ groups: [], findings: [], evidence: [], count: 0, rejected: 0 });
    let result = empty();
    const snapshot = () => ({ ...result, resultVersion, states: { ...states }, current, analyzed });
    function publish() { if (!disposed) onChange(snapshot()); }
    function resolve() {
        const ticket = ++resolution, token = generation, job = current;
        const proseRequired = states.retext === 'complete' && selectedWritingLenses(job.preferences).some(lens => lens !== 'spelling');
        const input = { job, proseRequired, projection, observations: [...observations], spelling: spellings, valeOutput };
        const active = () => !disposed && ticket === resolution && token === generation;
        states.review = 'analyzing'; publish();
        resolutionQueue = resolutionQueue.catch(() => {}).then(async () => {
            if (!active()) return;
            try {
                const value = await review.resolve({ ...input, identities, identitySource, nextIdentity });
                if (!active()) return;
                ({ result, identities, nextIdentity } = value); identitySource = job.source; resultVersion++;
                states.review = value.proseFailure || 'complete'; publish();
            } catch (error) {
                if (active()) { states.review = /timed out/i.test(error.message) ? 'timed out' : 'failed'; publish(); }
            }
        });
        return resolutionQueue;
    }
    async function run() {
        timer = null;
        if (disposed || !current) return;
        if (running) { pending = true; return; }
        running = true; pending = false;
        const job = current, token = generation;
        const selected = selectedWritingLenses(job.preferences);
        const proseWanted = selected.some(lens => lens !== 'spelling');
        const valeWanted = selected.some(lens => ['plain', 'direct', 'repetition', 'consistency', 'readability'].includes(lens));
        const proseEnabled = proseWanted && job.language.startsWith('en-');
        const spellEnabled = selected.includes('spelling') && job.spelling.enabled && writingLensSupportsLanguage('spelling', job.language);
        observations = []; spellings = []; valeOutput = undefined; projection = undefined; analyzed = job;
        states = {
            retext: proseEnabled ? 'analyzing' : !proseWanted || job.language === 'none' ? 'disabled' : 'unsupported',
            vale: proseEnabled && valeWanted ? 'analyzing' : !valeWanted || job.language === 'none' ? 'disabled' : 'unsupported',
            spelling: spellEnabled ? 'analyzing' : 'disabled',
        };
        publish();
        const active = () => !disposed && token === generation;
        await Promise.allSettled([
            (async () => {
                if (!proseEnabled) return;
                try {
                    const value = await retext.analyze(job.source);
                    if (!active()) return;
                    projection = value.projection; observations.push(...value.observations); states.retext = 'complete'; await resolve();
                } catch (error) {
                    if (active()) { states.retext = /timed out/i.test(error.message) ? 'timed out' : 'failed'; if (valeWanted) states.vale = 'unavailable'; await resolve(); }
                    return;
                }
                if (!valeWanted) return;
                try {
                    const output = await vale.analyze(String(token), projection.text);
                    if (active()) { valeOutput = output; states.vale = 'complete'; await resolve(); }
                } catch (error) {
                    if (active()) { states.vale = /deadline|timed out/i.test(error.message) ? 'timed out' : 'failed'; await resolve(); }
                }
            })(),
            (async () => {
                if (!spellEnabled) return;
                try {
                    const values = await spelling(job.source, job.spelling.language);
                    if (active()) { spellings = values; states.spelling = 'complete'; await resolve(); }
                } catch (error) { if (active()) { states.spelling = /timed out/i.test(error.message) ? 'timed out' : 'failed'; await resolve(); } }
            })(),
        ]);
        running = false;
        if (active()) {
            const retained = new Set(result.findings.map(finding => finding.displayId));
            identities = identities.filter(item => retained.has(item.displayId));
        }
        if (pending && !timer && !disposed) void run();
    }
    return {
        snapshot,
        update(next, { immediate = false } = {}) {
            if (disposed) return;
            if (!force && current?.id === next?.id && current?.revision === next?.revision && current?.configuration === next?.configuration) {
                current = next;
                if (immediate && timer !== null) { unschedule(timer); timer = schedule(() => { void run(); }, 0); }
                return;
            }
            const sameInput = current && next && current.id === next.id && current.revision === next.revision
                && current.language === next.language && JSON.stringify(current.spelling) === JSON.stringify(next.spelling);
            const canReuse = !force && !running && analyzed && sameInput && states.review === 'complete' && !next.decisionsPending && !next.decisionsFailed
                && (states.retext === 'complete' || !selectedWritingLenses(next.preferences).some(lens => lens !== 'spelling'))
                && (states.vale === 'complete' || !selectedWritingLenses(next.preferences).some(lens => ['plain', 'direct', 'repetition', 'consistency', 'readability'].includes(lens)))
                && (!selectedWritingLenses(next.preferences).includes('spelling') || states.spelling === 'complete' || !next.spelling.enabled);
            if (canReuse) {
                current = next; analyzed = next; result = empty(); resultVersion++; void resolve(); return;
            }
            force = false;
            if (current?.id !== next?.id) { identities = []; identitySource = undefined; }
            const oldToken = generation;
            generation++; resolution++; review.cancel(); retext.cancel(); spelling.cancel?.(); vale.cancel(String(oldToken));
            current = next; analyzed = null; result = empty(); resultVersion++; observations = []; projection = undefined;
            unschedule(timer); timer = null; pending = false;
            states = next ? { refresh: next.decisionsFailed ? 'failed' : 'analyzing' } : {}; publish();
            if (next && !next.decisionsPending && !next.decisionsFailed && selectedWritingLenses(next.preferences).length) {
                timer = schedule(() => { void run(); }, immediate ? 0 : 500);
            }
        },
        retry() { force = true; this.update(current, { immediate: true }); },
        fix(id, index, fresh, apply) {
            const fix = result.findings.find(item => item.id === id)?.fixes[index];
            if (!validateWritingFix(analyzed, fresh, fix)) { this.retry(); return false; }
            apply(fix); return true;
        },
        fixAll(id, fresh, apply) {
            const fixes = planWritingBulkFix(snapshot(), id, fresh);
            if (!fixes) { this.retry(); return 0; }
            apply(fixes); return fixes.length;
        },
        destroy() {
            disposed = true; generation++; resolution++; unschedule(timer); review.cancel(); retext.cancel(); spelling.cancel?.(); vale.cancel(String(generation - 1));
            current = null; analyzed = null; observations = []; identities = []; result = empty();
        },
    };
}
