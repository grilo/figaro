import { createMermaidPreviewSession } from '../../../frontend/js/usecases/mermaidPreviewSession.js';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

describe('Mermaid preview session', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('debounces parsing and publishes only the latest source', async () => {
        const parse = jest.fn().mockResolvedValue({ diagramType: 'flowchart-v2' });
        const render = jest.fn(source => Promise.resolve(`<svg>${source}</svg>`));
        const previews = [];
        const session = createMermaidPreviewSession({
            parse,
            render,
            onPreview: svg => previews.push(svg),
            setTimer: setTimeout,
            clearTimer: clearTimeout,
            now: () => Date.now(),
            validationDelay: 400,
        });

        session.schedule('first');
        jest.advanceTimersByTime(250);
        session.schedule('second');
        jest.advanceTimersByTime(399);
        expect(parse).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        await flush();

        expect(parse).toHaveBeenCalledTimes(1);
        expect(parse).toHaveBeenCalledWith('second');
        expect(render).toHaveBeenCalledWith('second');
        expect(previews).toEqual(['<svg>second</svg>']);
        session.destroy();
    });

    test('publishes inspection metadata only for the latest source and never after close', async () => {
        let releaseFirst;
        const first = new Promise(resolve => {releaseFirst = resolve;});
        const latest = {diagramType:'flowchart-v2',nodes:[{id:'B'}]};
        const statuses = [];
        const session = createMermaidPreviewSession({
            parse: jest.fn(source => source === 'first' ? first : Promise.resolve(latest)),
            render: () => Promise.resolve('<svg/>'), onStatus: value => statuses.push(value),
            setTimer:setTimeout,clearTimer:clearTimeout,now:()=>Date.now(),validationDelay:400,
        });
        session.schedule('first');
        jest.advanceTimersByTime(400);
        session.schedule('second');
        jest.advanceTimersByTime(400);
        await flush();
        releaseFirst({diagramType:'flowchart-v2',nodes:[{id:'stale'}]});
        await flush();
        expect(statuses.filter(status => status.inspection)).toEqual([
            {phase:'valid',hasError:false,diagramType:'flowchart-v2',inspection:latest,source:'second'},
        ]);
        session.schedule('third');
        session.destroy();
        const count = statuses.length;
        jest.runOnlyPendingTimers();
        await flush();
        expect(statuses).toHaveLength(count);
    });

    test('keeps an active render serialized and discards its stale result', async () => {
        let resolveFirst;
        const firstRender = new Promise(resolve => { resolveFirst = resolve; });
        const parse = jest.fn().mockResolvedValue({ diagramType: 'flowchart-v2' });
        const render = jest.fn(source => source === 'first' ? firstRender : Promise.resolve('<svg>second</svg>'));
        const previews = [];
        const session = createMermaidPreviewSession({
            parse,
            render,
            onPreview: svg => previews.push(svg),
            setTimer: setTimeout,
            clearTimer: clearTimeout,
            now: () => Date.now(),
            validationDelay: 400,
        });

        session.schedule('first');
        jest.advanceTimersByTime(400);
        await flush();
        session.schedule('second');
        jest.advanceTimersByTime(400);
        await flush();
        expect(render).toHaveBeenCalledTimes(1);

        resolveFirst('<svg>first</svg>');
        await flush();
        jest.advanceTimersByTime(1000);
        await flush();

        expect(render).toHaveBeenCalledTimes(2);
        expect(previews).toEqual(['<svg>second</svg>']);
        session.destroy();
    });

    test('reports syntax errors without replacing the last published preview', async () => {
        const parse = jest.fn(source => source === 'bad'
            ? Promise.reject(Object.assign(new Error('Parse error'), { line: 1 }))
            : Promise.resolve({ diagramType: 'flowchart-v2' }));
        const diagnostics = [];
        const previews = [];
        const statuses = [];
        const session = createMermaidPreviewSession({
            parse,
            render: source => Promise.resolve(`<svg>${source}</svg>`),
            onDiagnostics: value => diagnostics.push(value),
            onPreview: value => previews.push(value),
            onStatus: value => statuses.push(value),
            setTimer: setTimeout,
            clearTimer: clearTimeout,
            now: () => Date.now(),
            validationDelay: 400,
        });

        session.schedule('good');
        jest.advanceTimersByTime(400);
        await flush();
        session.schedule('bad');
        jest.advanceTimersByTime(400);
        await flush();

        expect(previews).toEqual(['<svg>good</svg>']);
        expect(diagnostics.at(-1)[0]).toMatchObject({ severity: 'error', source: 'Mermaid' });
        expect(statuses.at(-1)).toMatchObject({ phase: 'error', hasError: true });
        session.destroy();
    });
});
