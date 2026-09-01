import { createLatestPreviewSession } from '../../../frontend/js/usecases/latestPreviewSession.js';

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
    return { promise, resolve, reject };
};
const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };

describe('latest preview session', () => {
    test('serializes rendering and publishes only the latest request', async () => {
        const first = deferred();
        const latest = deferred();
        const render = jest.fn(value => value === 'first' ? first.promise : latest.promise);
        const publish = jest.fn();
        const reportError = jest.fn();
        const session = createLatestPreviewSession({ render, publish, reportError });

        session.request('first');
        session.request('superseded');
        session.request('latest');
        expect(render).toHaveBeenCalledTimes(1);
        first.resolve('old SVG');
        await flush();
        expect(render).toHaveBeenCalledTimes(2);
        expect(render).toHaveBeenLastCalledWith('latest');
        expect(publish).not.toHaveBeenCalled();
        latest.resolve('new SVG');
        await flush();
        expect(publish).toHaveBeenCalledWith('new SVG', 'latest');
        expect(reportError).not.toHaveBeenCalled();
    });

    test('suppresses stale errors and ignores completion after destruction', async () => {
        const first = deferred();
        const latest = deferred();
        const publish = jest.fn();
        const reportError = jest.fn();
        const session = createLatestPreviewSession({
            render: value => value === 'first' ? first.promise : latest.promise,
            publish,
            reportError,
        });

        session.request('first');
        session.request('latest');
        first.reject(new Error('stale failure'));
        await flush();
        expect(reportError).not.toHaveBeenCalled();
        session.destroy();
        latest.resolve('late SVG');
        await flush();
        expect(publish).not.toHaveBeenCalled();
        expect(reportError).not.toHaveBeenCalled();
        expect(session.request('ignored')).toBe(false);
    });
});
