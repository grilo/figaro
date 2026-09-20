import { subscribeEditorUpdates, publishEditorUpdate } from '../../../frontend/js/editorUpdates.js';
import { EDITOR_UPDATE_CONSUMERS, editorUpdateReasons, editorConsumerReasons } from '../../../frontend/js/core/editorUpdateContract.js';
import { editorDiagnostics } from '../../../frontend/js/editorDiagnostics.js';

describe('declared editor update dependencies', () => {
    test('a selection update reaches only selection consumers; all other causes are explicit', () => {
        expect(Object.keys(EDITOR_UPDATE_CONSUMERS).filter(name => editorConsumerReasons(name, ['selection']).length)).toEqual(['outline']);
        expect(editorUpdateReasons({ docChanged: true, selectionSet: true, viewportChanged: true, geometryChanged: true, syntaxChanged: true, ownerChanged: true }))
            .toEqual(['document', 'selection', 'viewport', 'geometry', 'syntax', 'owner']);
        expect(() => subscribeEditorUpdates('undeclared', () => {})).toThrow('Unknown');
    });
    test('100 cursor changes never enter document or preview consumers, while editing and ownership do', async () => {
        const callbacks = Object.fromEntries(Object.keys(EDITOR_UPDATE_CONSUMERS).map(name => [name, jest.fn()]));
        const stops = Object.entries(callbacks).map(([name, callback]) => subscribeEditorUpdates(name, callback));
        editorDiagnostics.start();
        try {
            editorDiagnostics.interaction('cursor', ['selection'], () => {
                for (let n = 0; n < 100; n++) publishEditorUpdate({ selectionSet: true });
            });
            await Promise.resolve();
            expect(callbacks.outline).toHaveBeenCalledTimes(100);
            for (const name of ['activity', 'writing', 'previews']) expect(callbacks[name]).not.toHaveBeenCalled();
            expect(editorDiagnostics.snapshot()[0].work.every(work => work.consumer === 'outline')).toBe(true);
            publishEditorUpdate({ docChanged: true });
            expect(callbacks.writing).toHaveBeenCalledTimes(1);
            expect(callbacks.activity).toHaveBeenCalledTimes(1);
            publishEditorUpdate({ ownerChanged: true, documentTabId: 'old' });
            publishEditorUpdate({ ownerChanged: true, documentTabId: 'latest' });
            expect(callbacks.previews).not.toHaveBeenCalled();
            await Promise.resolve();
            expect(callbacks.previews).toHaveBeenCalledTimes(1);
            expect(callbacks.previews.mock.calls[0][0].documentTabId).toBe('latest');
        } finally { stops.forEach(stop => stop()); editorDiagnostics.stop(); }
    });
    test('disposal cancels deferred observers; a failed consumer does not block its peers', async () => {
        const preview = jest.fn();
        const stop = subscribeEditorUpdates('previews', preview);
        publishEditorUpdate({ ownerChanged: true }); stop();
        await Promise.resolve();
        expect(preview).not.toHaveBeenCalled();
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        const bad = subscribeEditorUpdates('outline', () => { throw new Error('broken observer'); });
        const good = jest.fn(), done = subscribeEditorUpdates('writing', good);
        try { publishEditorUpdate({ docChanged: true }); expect(good).toHaveBeenCalledTimes(1); }
        finally { bad(); done(); error.mockRestore(); }
    });
});
