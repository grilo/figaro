import { playEntranceAnimation } from '../frontend/js/motion.js';

describe('panel entrance motion', () => {
    test('adds the default entrance class and restarts it for a persistent panel', () => {
        const panel = document.createElement('section');
        panel.classList.add('figaro-panel-enter');

        playEntranceAnimation(panel);

        expect(panel.classList.contains('figaro-panel-enter')).toBe(true);
    });

    test('supports a component-specific entrance class and ignores a missing element', () => {
        const panel = document.createElement('section');

        playEntranceAnimation(panel, 'custom-enter');
        playEntranceAnimation(null, 'custom-enter');

        expect(panel.classList.contains('custom-enter')).toBe(true);
    });
});
