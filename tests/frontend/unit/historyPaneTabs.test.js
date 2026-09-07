import { configureHistoryPaneTabs, prependHistoryPaneTabs } from '../../../frontend/js/historyPaneTabs.js';
test('Activity is unavailable with an explanation on non-Markdown versions; both history views remain visible', () => {
 const activity=jest.fn(),versions=jest.fn(); configureHistoryPaneTabs({activity,versions,activityAvailable:()=>false});
 const host=document.createElement('div'); prependHistoryPaneTabs(host,'versions');
 const buttons=[...host.querySelectorAll('button')]; expect(buttons.map(b=>b.textContent)).toEqual(['Activity','Versions']);
 expect(buttons[0].disabled).toBe(true); expect(buttons[0].title).toContain('Markdown');
 expect(buttons[1].getAttribute('aria-pressed')).toBe('true');buttons[0].click();expect(activity).not.toHaveBeenCalled();
});
