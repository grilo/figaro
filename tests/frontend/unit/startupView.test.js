import { revealStartupWorkspace } from '../frontend/js/views/startupView.js';

describe('startup workspace presentation', () => {
    test('keeps the editor concealed for two layout frames before revealing it', async () => {
        document.body.innerHTML = '<div id="app" data-startup-hydrating="true"></div>';
        const frames = [];
        const scheduleFrame = callback => frames.push(callback);
        let settled = false;

        const reveal = revealStartupWorkspace({ scheduleFrame }).then(() => { settled = true; });
        expect(document.getElementById('app').dataset.startupHydrating).toBe('true');
        expect(frames).toHaveLength(1);

        frames.shift()();
        expect(document.getElementById('app').dataset.startupHydrating).toBe('true');
        expect(frames).toHaveLength(1);
        expect(settled).toBe(false);

        frames.shift()();
        await reveal;
        expect(document.getElementById('app').hasAttribute('data-startup-hydrating')).toBe(false);
        expect(settled).toBe(true);
    });
});
