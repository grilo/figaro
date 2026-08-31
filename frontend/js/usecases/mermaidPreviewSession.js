import { mermaidDiagnostic, mermaidRenderDelay } from '../core/mermaidEditorModel.js';

/**
 * Coordinate Mermaid validation and rendering without coupling scheduling
 * policy to CodeMirror or the modal DOM. Only the newest source may publish.
 */
export function createMermaidPreviewSession({
    parse,
    render,
    onDiagnostics,
    onPreview,
    onStatus,
    setTimer,
    clearTimer,
    now,
    validationDelay = 400,
}) {
    if (typeof setTimer !== 'function' || typeof clearTimer !== 'function' || typeof now !== 'function') {
        throw new TypeError('Mermaid preview timing ports are required');
    }
    let generation = 0;
    let validationTimer = null;
    let renderTimer = null;
    let rendering = false;
    let pendingRender = null;
    let lastRenderDuration = 0;
    let destroyed = false;

    const publishStatus = status => {
        if (!destroyed) onStatus?.(status);
    };

    const startNextRender = () => {
        if (destroyed || rendering || renderTimer || !pendingRender) return;
        const delay = mermaidRenderDelay(lastRenderDuration);
        const run = async () => {
            renderTimer = null;
            const job = pendingRender;
            pendingRender = null;
            if (!job || job.generation !== generation) {
                startNextRender();
                return;
            }
            rendering = true;
            publishStatus({ phase: 'rendering', hasError: false });
            const startedAt = now();
            try {
                const svg = await render(job.source);
                lastRenderDuration = Math.max(0, now() - startedAt);
                if (!destroyed && job.generation === generation && svg) {
                    onPreview?.(svg);
                    publishStatus({ phase: 'ready', hasError: false });
                }
            } catch (error) {
                if (!destroyed && job.generation === generation) {
                    onDiagnostics?.([mermaidDiagnostic(error, job.source)]);
                    publishStatus({ phase: 'error', hasError: true, message: mermaidDiagnostic(error, job.source).message });
                }
            } finally {
                rendering = false;
                startNextRender();
            }
        };
        if (delay > 0) renderTimer = setTimer(run, delay);
        else void run();
    };

    const validate = async (source, jobGeneration) => {
        try {
            const result = await parse(source);
            if (destroyed || jobGeneration !== generation) return;
            onDiagnostics?.([]);
            pendingRender = { source, generation: jobGeneration };
            onStatus?.({ phase: 'valid', hasError: false, diagramType: result?.diagramType || '', inspection: result, source });
            startNextRender();
        } catch (error) {
            if (destroyed || jobGeneration !== generation) return;
            const diagnostic = mermaidDiagnostic(error, source);
            pendingRender = null;
            onDiagnostics?.([diagnostic]);
            publishStatus({ phase: 'error', hasError: true, message: diagnostic.message });
        }
    };

    return {
        schedule(source) {
            if (destroyed) return;
            generation += 1;
            const jobGeneration = generation;
            if (validationTimer) clearTimer(validationTimer);
            if (renderTimer) {
                clearTimer(renderTimer);
                renderTimer = null;
            }
            pendingRender = null;
            publishStatus({ phase: 'checking', hasError: false });
            validationTimer = setTimer(() => {
                validationTimer = null;
                void validate(String(source || ''), jobGeneration);
            }, validationDelay);
        },
        destroy() {
            destroyed = true;
            generation += 1;
            if (validationTimer) clearTimer(validationTimer);
            if (renderTimer) clearTimer(renderTimer);
            validationTimer = null;
            renderTimer = null;
            pendingRender = null;
        },
    };
}
