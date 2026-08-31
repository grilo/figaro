import { tooltipPosition } from '../frontend/js/core/tooltipModel.js';
import { initTooltips, setTooltip } from '../frontend/js/tooltip.js';

describe('design-system tooltip', () => {
    let controller;

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="outline" title="Show document outline">Outline</button>
            <iframe id="preview" title="Live PDF preview"></iframe>`;
        const outline = document.getElementById('outline');
        outline.getBoundingClientRect = () => ({
            left: 100, right: 140, top: 20, bottom: 50, width: 40, height: 30,
        });
        controller = initTooltips({ root: document, showDelay: 0 });
    });

    afterEach(() => controller.destroy());

    test('adopts native hints into one themed hover/focus surface while preserving iframe names', () => {
        const outline = document.getElementById('outline');
        expect(outline.hasAttribute('title')).toBe(false);
        expect(outline.dataset.uiTooltip).toBe('Show document outline');
        expect(document.getElementById('preview').title).toBe('Live PDF preview');

        outline.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        const tooltip = document.getElementById('ui-tooltip');
        expect(tooltip.className).toBe('ui-tooltip');
        expect(tooltip.getAttribute('role')).toBe('tooltip');
        expect(tooltip.textContent).toBe('Show document outline');
        expect(tooltip.hidden).toBe(false);
        expect(outline.getAttribute('aria-describedby')).toBe('ui-tooltip');

        outline.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
        expect(tooltip.hidden).toBe(true);
        expect(outline.hasAttribute('aria-describedby')).toBe(false);

        outline.focus();
        expect(tooltip.hidden).toBe(false);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(tooltip.hidden).toBe(true);
    });

    test('adopts dynamically mounted and updated title hints without leaking its description', async () => {
        const dynamic = document.createElement('button');
        dynamic.title = 'First hint';
        document.body.appendChild(dynamic);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(dynamic.hasAttribute('title')).toBe(false);
        expect(dynamic.dataset.uiTooltip).toBe('First hint');

        dynamic.getBoundingClientRect = () => ({
            left: 10, right: 50, top: 10, bottom: 30, width: 40, height: 20,
        });
        dynamic.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        expect(dynamic.getAttribute('aria-describedby')).toBe('ui-tooltip');

        dynamic.title = 'Updated hint';
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(dynamic.hasAttribute('title')).toBe(false);
        expect(dynamic.dataset.uiTooltip).toBe('Updated hint');
        expect(document.getElementById('ui-tooltip').textContent).toBe('Updated hint');

        dynamic.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
        expect(dynamic.hasAttribute('aria-describedby')).toBe(false);

        expect(setTooltip(dynamic, '')).toBe(false);
        expect(dynamic.hasAttribute('data-ui-tooltip')).toBe(false);
    });

    test('uses the visible label as the hover and positioning surface for hidden toggle inputs', async () => {
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" title="Enable Vim Mode first" disabled>
            <span class="toggle-slider"></span>`;
        label.getBoundingClientRect = () => ({
            left: 60, right: 96, top: 70, bottom: 90, width: 36, height: 20,
        });
        document.body.appendChild(label);
        await new Promise(resolve => setTimeout(resolve, 0));

        const input = label.querySelector('input');
        const slider = label.querySelector('.toggle-slider');
        expect(input.hasAttribute('title')).toBe(false);
        expect(input.dataset.uiTooltip).toBe('Enable Vim Mode first');

        slider.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        expect(document.getElementById('ui-tooltip').textContent).toBe('Enable Vim Mode first');
        expect(document.getElementById('ui-tooltip').hidden).toBe(false);
        expect(input.getAttribute('aria-describedby')).toBe('ui-tooltip');

        slider.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: label }));
        expect(document.getElementById('ui-tooltip').hidden).toBe(false);
        label.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
        expect(document.getElementById('ui-tooltip').hidden).toBe(true);

        slider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        slider.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(document.getElementById('ui-tooltip').textContent).toBe('Enable Vim Mode first');
        expect(document.getElementById('ui-tooltip').hidden).toBe(false);
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(document.getElementById('ui-tooltip').hidden).toBe(true);
    });

    test('clamps horizontally and flips above anchors near the viewport bottom', () => {
        expect(tooltipPosition(
            { left: 190, right: 210, top: 30, bottom: 50 },
            { width: 100, height: 30 },
            { width: 220, height: 160 },
        )).toEqual({ left: 112, top: 57, placement: 'bottom' });

        expect(tooltipPosition(
            { left: 40, right: 80, top: 130, bottom: 150 },
            { width: 80, height: 40 },
            { width: 200, height: 160 },
        )).toEqual({ left: 20, top: 83, placement: 'top' });
    });
});
