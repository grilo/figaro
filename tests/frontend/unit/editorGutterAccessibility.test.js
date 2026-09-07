import { syncEditorGutterAccessibility } from '../../../frontend/js/editorGutterAccessibility.js';
test('activity date buttons remain exposed to assistive technology when block guides are off', () => {
 const dom=document.createElement('div');dom.innerHTML='<div class="cm-gutters" aria-hidden="true"><div class="cm-gutter cm-lineNumbers">1</div><div class="cm-gutter cm-activityGutter" aria-hidden="true"><button aria-label="Show activity">7 Sep</button></div></div>';
 syncEditorGutterAccessibility({dom});
 expect(dom.querySelector('.cm-gutters').hasAttribute('aria-hidden')).toBe(false);
 const gutter=dom.querySelector('.cm-activityGutter');expect(gutter.hasAttribute('aria-hidden')).toBe(false);
 expect(gutter.getAttribute('role')).toBe('group');expect(gutter.getAttribute('aria-label')).toBe('Passage activity');
 expect(dom.querySelector('.cm-lineNumbers').getAttribute('aria-hidden')).toBe('true');
 gutter.remove();syncEditorGutterAccessibility({dom});expect(dom.querySelector('.cm-gutters').getAttribute('aria-hidden')).toBe('true');
});
