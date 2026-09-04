import { expect, test } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('dismisses a tooltip when its stationary-pointer owner reflows or is removed', async ({ page }) => {
    await page.goto('/design-system/');
    const trigger = page.getByRole('button', { name: 'Show document outline' });
    const tooltip = page.locator('#ui-tooltip');

    await trigger.scrollIntoViewIfNeeded();
    await trigger.hover();
    await expect(tooltip).toBeVisible();
    await trigger.evaluate(element => { element.style.translate = '180px 0'; });
    await expect(tooltip).toBeHidden();

    await page.mouse.move(0, 0);
    await trigger.hover();
    await expect(tooltip).toBeVisible();
    await trigger.evaluate(element => element.remove());
    await expect(tooltip).toBeHidden();
});

test('renders file attention as a supplemental themed state without changing row geometry', async ({ page }) => {
    await page.goto('/design-system/');

    const warning = page.locator('.file-tree-node.file-issue--warning');
    const danger = page.locator('.file-tree-node.file-issue--danger');
    await warning.scrollIntoViewIfNeeded();
    await expect(warning.locator('.node-icon')).toBeVisible();
    await expect(warning.locator('.node-issue-indicator')).toBeVisible();
    await expect(danger.locator('.node-icon')).toBeVisible();
    await expect(danger.locator('.node-issue-indicator')).toBeVisible();

    const presentation = await page.locator('.file-tree-node').evaluateAll(nodes => {
        const read = selector => {
            const node = nodes.find(candidate => candidate.matches(selector));
            const style = getComputedStyle(node);
            return {
                background: style.backgroundColor,
                shadow: style.boxShadow,
                height: node.getBoundingClientRect().height,
            };
        };
        return {
            normal: read('.file-tree-node:not(.selected):not(.file-issue--warning):not(.file-issue--danger)'),
            warning: read('.file-issue--warning'),
            danger: read('.file-issue--danger'),
        };
    });
    expect(presentation.warning.background).not.toBe(presentation.normal.background);
    expect(presentation.danger.background).not.toBe(presentation.normal.background);
    expect(presentation.warning.shadow).not.toBe('none');
    expect(presentation.danger.shadow).not.toBe('none');
    expect(presentation.warning.height).toBe(presentation.normal.height);
    expect(presentation.danger.height).toBe(presentation.normal.height);

    const status = page.getByRole('button', { name: 'Saving is blocked. Action required. Open file diagnostics.' });
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(/ui-button--danger/);
    await expect(status).toContainText('Saving blocked — action required');
});

test('catalogues current elements with themed combobox geometry and seamless steppers', async ({ page }) => {
    await page.goto('/design-system/');

    await expect(page.getByRole('heading', { name: 'Every visible pattern, in one place.' })).toBeVisible();
    await expect(page.locator('[data-catalog-section]')).toHaveCount(12);

    const themeSelect = page.locator('#theme-select');
    await expect(themeSelect.locator('option')).toHaveCount(18);
    await expect(themeSelect).toHaveValue('default');
    await expect(page.locator('#theme-status')).toHaveText('18 themes · Figaro Dark');
    await expect(page.locator('[data-token="--accent-color"] .ds-token-value')).toHaveText('#d8574a');

    // Computed cascade boundary: every segmented choice consumes the shared
    // theme tokens in all three Figaro themes, including selected paint.
    for (const theme of ['default', 'figaro-light', 'figaro-crt-phosphor']) {
        await themeSelect.selectOption(theme);
        const choice = page.locator('.ui-segmented-control').first();
        const selected = choice.locator('.ui-button[aria-pressed="true"]').first();
        await expect.poll(() => choice.evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
        await expect.poll(() => choice.evaluate(element => {
            const probe = document.createElement('span');
            probe.style.background = 'var(--active-bg)';
            probe.style.color = 'var(--accent-color)';
            document.body.append(probe);
            const selectedButton = element.querySelector('.ui-button[aria-pressed="true"]');
            const highlight = getComputedStyle(element, '::before');
            const matches = highlight.backgroundColor === getComputedStyle(probe).backgroundColor
                && getComputedStyle(selectedButton).backgroundColor === 'rgba(0, 0, 0, 0)'
                && getComputedStyle(selectedButton).color === getComputedStyle(probe).color;
            probe.remove();
            return matches;
        })).toBe(true);
        await expect(choice).toHaveCSS('border-radius', '999px');
        await selected.hover();
        await expect.poll(() => selected.evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
        await expect.poll(() => selected.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
        await expect.poll(() => selected.evaluate(el => {
            const probe = document.createElement('span');
            probe.style.color = 'var(--accent-color)';
            document.body.append(probe);
            const matches = getComputedStyle(el).color === getComputedStyle(probe).color;
            probe.remove();
            return matches;
        })).toBe(true);
        await selected.focus();
        await expect(selected).toBeFocused();
        expect(await selected.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
        const unselected = choice.locator('.ui-button[aria-pressed="false"]').first();
        await unselected.focus();
        await expect(unselected).toBeFocused();
        await expect.poll(() => unselected.evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
        expect(await unselected.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
        await unselected.hover();
        await page.mouse.down();
        try {
            await expect.poll(() => unselected.evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
        } finally { await page.mouse.up(); }
    }
    await themeSelect.selectOption('default');

    const fourChoices = page.getByRole('group', { name: 'Legend position example' });
    await fourChoices.evaluate(element => {
        [...element.children].forEach((button, index) => {
            button.setAttribute('aria-pressed', String(index === 3));
        });
    });
    await expect.poll(() => fourChoices.evaluate(element => {
        const selectedButton = element.querySelector('[aria-pressed="true"]');
        const selected = selectedButton.getBoundingClientRect();
        const highlight = getComputedStyle(element, '::before');
        const matrix = new DOMMatrixReadOnly(highlight.transform);
        const track = element.getBoundingClientRect();
        const highlightLeft = track.left + Number.parseFloat(highlight.left) + matrix.m41;
        const highlightWidth = Number.parseFloat(highlight.width);
        const rows = new Set([...element.children].map(button => Math.round(button.getBoundingClientRect().top)));
        return Math.abs(highlightLeft - selected.left) <= 1
            && Math.abs(highlightWidth - selected.width) <= 1
            && rows.size === 1;
    })).toBe(true);

    const quietChoice = page.getByRole('group', { name: 'Calendar presentation example' });
    const darkQuietSurface = await quietChoice.evaluate(element => getComputedStyle(element).backgroundColor);
    expect(darkQuietSurface).not.toBe('rgba(0, 0, 0, 0)');
    await themeSelect.selectOption('github');
    await expect.poll(() => quietChoice.evaluate(element => getComputedStyle(element).borderTopColor))
        .toBe('rgba(0, 0, 0, 0)');
    const lightQuietSurface = await quietChoice.evaluate(element => getComputedStyle(element).backgroundColor);
    expect(lightQuietSurface).not.toBe('rgba(0, 0, 0, 0)');
    expect(lightQuietSurface).not.toBe(darkQuietSurface);
    await themeSelect.selectOption('default');

    const themedCheckbox = page.getByRole('checkbox', { name: 'Frontmatter boolean' });
    const readCheckboxPaint = locator => locator.evaluate(element => {
        const resolveColor = value => {
            const probe = document.createElement('span');
            probe.style.backgroundColor = value;
            document.body.appendChild(probe);
            const color = getComputedStyle(probe).backgroundColor;
            probe.remove();
            return color;
        };
        const style = getComputedStyle(element);
        const mark = getComputedStyle(element, '::before');
        return {
            accent: resolveColor('var(--accent-color)'),
            background: style.backgroundColor,
            radius: style.borderRadius,
            appearance: style.appearance,
            markBackground: mark.backgroundColor,
            markTransform: mark.transform,
        };
    });
    await expect.poll(async () => {
        const paint = await readCheckboxPaint(themedCheckbox);
        return paint.background === paint.accent;
    }).toBe(true);
    const darkCheckbox = await readCheckboxPaint(themedCheckbox);
    expect(darkCheckbox).toMatchObject({
        background: darkCheckbox.accent,
        radius: '4px',
        appearance: 'none',
    });
    expect(darkCheckbox.markTransform).not.toBe('none');

    const tooltipTrigger = page.getByRole('button', { name: 'Show document outline' });
    await expect(tooltipTrigger).not.toHaveAttribute('title', /.+/);
    await tooltipTrigger.scrollIntoViewIfNeeded();
    await tooltipTrigger.hover();
    const tooltip = page.locator('#ui-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText('Show document outline');
    await expect(tooltipTrigger).toHaveAttribute('aria-describedby', /ui-tooltip/);
    const darkTooltip = await tooltip.evaluate(surface => {
        const resolveColor = value => {
            const probe = document.createElement('span');
            probe.style.color = value;
            document.body.appendChild(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
        };
        const style = getComputedStyle(surface);
        return {
            background: style.backgroundColor,
            panel: resolveColor('var(--panel-bg)'),
            color: style.color,
            text: resolveColor('var(--text-color)'),
            border: style.borderTopColor,
            borderToken: resolveColor('var(--border-color)'),
        };
    });
    expect(darkTooltip).toEqual({
        background: darkTooltip.panel,
        panel: darkTooltip.panel,
        color: darkTooltip.text,
        text: darkTooltip.text,
        border: darkTooltip.borderToken,
        borderToken: darkTooltip.borderToken,
    });
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await page.mouse.move(0, 0);

    await themeSelect.selectOption('figaro-light');
    await expect(page.locator('#catalog-theme')).toHaveAttribute('href', '../themes/figaro-light.css');
    await expect(page.locator('#theme-status')).toHaveText('18 themes · Figaro Light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'figaro-light');
    await expect(page.locator('[data-token="--accent-color"] .ds-token-value')).toHaveText('#b94a3e');
    await expect.poll(async () => (await readCheckboxPaint(themedCheckbox)).background)
        .toBe((await readCheckboxPaint(themedCheckbox)).accent);
    const lightCheckbox = await readCheckboxPaint(themedCheckbox);
    expect(lightCheckbox.background).toBe(lightCheckbox.accent);
    expect(lightCheckbox.background).not.toBe(darkCheckbox.background);
    await themedCheckbox.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(themedCheckbox).toBeFocused();
    expect(await themedCheckbox.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
    await tooltipTrigger.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await tooltipTrigger.evaluate(element => element.focus({ preventScroll: true }));
    await expect(tooltipTrigger).toBeFocused();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveCSS('background-color', await tooltip.evaluate(surface => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--panel-bg)';
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
    }));

    const autoSaveSource = page.locator('#catalog-auto-save');
    const autoSavePicker = page.locator('#form-controls .select-combobox').filter({ has: autoSaveSource });
    const autoSaveTrigger = autoSavePicker.locator('.select-combobox-trigger');
    const autoSaveMenu = page.locator('#catalog-auto-save-menu');
    await expect(autoSaveSource).toHaveClass(/select-combobox-native/);
    await autoSaveTrigger.click();
    await expect(autoSaveTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(autoSaveMenu).toBeVisible();
    await expect.poll(() => autoSaveTrigger.evaluate(element => getComputedStyle(element).borderTopColor))
        .toBe('rgba(0, 0, 0, 0)');
    await expect.poll(() => autoSaveTrigger.evaluate(element => getComputedStyle(element).boxShadow))
        .toBe('none');

    const themedPopup = await autoSaveMenu.evaluate(menu => {
        const resolveColor = value => {
            const probe = document.createElement('span');
            probe.style.color = value;
            document.body.appendChild(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
        };
        const style = getComputedStyle(menu);
        return {
            background: style.backgroundColor,
            panelToken: resolveColor('var(--panel-bg)'),
            color: style.color,
            textToken: resolveColor('var(--text-color)'),
            border: style.borderTopColor,
        };
    });
    expect(themedPopup.background).toBe(themedPopup.panelToken);
    expect(themedPopup.color).toBe(themedPopup.textToken);
    expect(themedPopup.border).toBe('rgba(0, 0, 0, 0)');

    await autoSaveMenu.getByRole('option', { name: 'Off' }).click();
    await expect(autoSaveSource).toHaveValue('0');
    await expect(autoSaveTrigger).toContainText('Off');
    await expect(autoSaveMenu).toBeHidden();

    await autoSaveTrigger.click();
    await autoSaveTrigger.press('Escape');
    await expect(autoSaveMenu).toBeHidden();
    await expect(autoSaveTrigger).toBeFocused();

    const appearancePicker = page.locator('[data-catalog-settings-picker="theme"]');
    const appearanceTrigger = appearancePicker.getByRole('combobox', { name: 'Theme' });
    const appearanceMenu = page.locator('[role="listbox"][aria-label="Theme options"]');
    await expect(appearanceMenu).toHaveAttribute('aria-label', 'Theme options');
    await appearanceTrigger.click();
    await expect(appearanceMenu).toBeVisible();
    await expect.poll(() => appearanceTrigger.evaluate(element => getComputedStyle(element).boxShadow))
        .toBe('none');
    await appearanceTrigger.press('Escape');
    await appearanceTrigger.press('ArrowDown');
    await expect(appearanceMenu).toBeVisible();
    await expect.poll(() => appearanceTrigger.evaluate(element => getComputedStyle(element).boxShadow))
        .not.toBe('none');
    await expect(appearanceTrigger).toHaveAttribute('aria-activedescendant', /option-0/);
    await appearanceTrigger.press('ArrowDown');
    await appearanceTrigger.press('Enter');
    await expect(appearanceTrigger).toContainText('Figaro Light');
    await expect(appearanceMenu.locator('[role="option"][data-value="figaro-light"]'))
        .toHaveAttribute('aria-selected', 'true');
    await expect(appearanceMenu).toBeHidden();
    await appearanceTrigger.press('ArrowDown');
    await appearanceTrigger.press('Tab');
    await expect(appearanceMenu).toBeHidden();

    const disabledTrigger = page.locator('#catalog-unavailable-combobox')
        .locator('xpath=..')
        .locator('.select-combobox-trigger');
    await expect(disabledTrigger).toBeDisabled();

    const pickerIndicator = autoSaveTrigger.locator('> svg');
    await expect(pickerIndicator).toHaveCSS('transform', 'none');
    const pickerIndicatorGeometry = await pickerIndicator.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const path = element.querySelector('path');
        return {
            width: bounds.width,
            height: bounds.height,
            fill: getComputedStyle(path).fill,
            stroke: getComputedStyle(path).stroke,
        };
    });
    expect(pickerIndicatorGeometry.width).toBeLessThanOrEqual(10.1);
    expect(pickerIndicatorGeometry.height).toBeLessThanOrEqual(6.1);
    expect(pickerIndicatorGeometry.fill).toBe('none');
    expect(pickerIndicatorGeometry.stroke).not.toBe('none');

    for (const prefix of ['font-size', 'text-width']) {
        const backgrounds = await page.locator(`#form-controls .${prefix}-control`).evaluate((control, itemPrefix) => {
            const button = control.querySelector(`.${itemPrefix}-btn`);
            const value = control.querySelector(`.${itemPrefix}-value`);
            return {
                button: getComputedStyle(button).backgroundColor,
                value: getComputedStyle(value).backgroundColor,
            };
        }, prefix);
        expect(backgrounds.value).toBe(backgrounds.button);
        expect(backgrounds.value).toBe('rgba(0, 0, 0, 0)');
    }

    const borderlessSurfaces = await page.locator('#surfaces-cards').evaluate(section => {
        const borderWidth = selector => getComputedStyle(section.querySelector(selector)).borderTopWidth;
        return {
            settings: borderWidth('.settings-card'),
            kanban: borderWidth('.kanban-card'),
        };
    });
    expect(borderlessSurfaces).toEqual({ settings: '0px', kanban: '0px' });

    await page.emulateMedia({ forcedColors: 'active' });
    const forcedColorBoundaries = await page.locator('#surfaces-cards').evaluate(section => {
        const border = selector => {
            const style = getComputedStyle(document.querySelector(selector) || section.querySelector(selector));
            return { width: style.borderTopWidth, color: style.borderTopColor };
        };
        return {
            settings: border('.settings-card'),
            kanban: border('.kanban-card'),
            picker: border('.ui-picker--quiet .ui-picker-trigger'),
            stepper: border('.ui-stepper--quiet'),
        };
    });
    for (const boundary of Object.values(forcedColorBoundaries)) {
        expect(boundary.width).toBe('1px');
        expect(boundary.color).not.toBe('rgba(0, 0, 0, 0)');
    }
    await page.emulateMedia({ forcedColors: 'none' });

    const primitiveFamilies = {
        '.ui-picker': 3,
        '.ui-picker--quiet': 3,
        '.ui-stepper': 2,
        '.ui-stepper--quiet': 2,
        '.ui-button': 12,
        '.ui-button--quiet': 2,
        '.ui-icon-button': 8,
        '.ui-badge': 6,
        '.ui-field': 4,
        '.ui-menu': 3,
        '.ui-tooltip': 3,
        '.ui-notice': 8,
        '.ui-document-tabs': 1,
        '.ui-document-tab': 2,
        '.ui-editor-fold-control': 1,
        '.ui-editor-block-guide': 4,
        '.ui-image-resize-handle': 3,
        '.ui-spinner': 1,
        '.ui-skeleton': 6,
    };
    for (const [selector, minimum] of Object.entries(primitiveFamilies)) {
        expect(await page.locator(selector).count()).toBeGreaterThanOrEqual(minimum);
    }

    const quietAction = page.locator('#buttons-actions .ds-specimen', {
        has: page.getByRole('heading', { name: 'Compact actions' }),
    }).locator('.ui-button--quiet');
    await expect(quietAction).toContainText('Edit YAML');
    await expect(quietAction.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    const quietRest = await quietAction.evaluate(button => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--text-muted)';
        document.body.appendChild(probe);
        const style = getComputedStyle(button);
        const result = {
            background: style.backgroundColor,
            border: style.borderTopColor,
            color: style.color,
            muted: getComputedStyle(probe).color,
        };
        probe.remove();
        return result;
    });
    expect(quietRest).toEqual({
        background: 'rgba(0, 0, 0, 0)',
        border: 'rgba(0, 0, 0, 0)',
        color: quietRest.muted,
        muted: quietRest.muted,
    });
    // Finish catalogue navigation before measuring pointer-only paint: earlier
    // keyboard focus can leave its smooth page scroll in flight under load.
    await quietAction.evaluate(button => button.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await quietAction.hover();
    const quietHoverToken = await quietAction.evaluate(button => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--active-bg)';
        document.body.appendChild(probe);
        const result = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return result;
    });
    await expect.poll(() => quietAction.evaluate(button => getComputedStyle(button).backgroundColor))
        .toBe(quietHoverToken);
    await quietAction.focus();
    expect(await quietAction.evaluate(button => getComputedStyle(button).boxShadow)).not.toBe('none');

    const disabledButtonCursors = await page.locator('.ds-specimen', {
        has: page.locator('h3', { hasText: 'Dialog actions' }),
    }).evaluate(specimen => {
        const ordinary = specimen.querySelector('.ui-button:disabled:not([aria-busy="true"])');
        const busy = specimen.querySelector('.ui-button:disabled[aria-busy="true"]');
        return {
            ordinary: getComputedStyle(ordinary).cursor,
            busy: getComputedStyle(busy).cursor,
        };
    });
    expect(disabledButtonCursors).toEqual({ ordinary: 'not-allowed', busy: 'wait' });

    const connectedTabPaint = await page.locator(
        '.ds-tab-bar .ui-document-tab--connected.ui-document-tab--active',
    ).evaluate(tab => {
        const style = getComputedStyle(tab);
        const leadingJunction = getComputedStyle(tab, '::before');
        const trailingJunction = getComputedStyle(tab, '::after');
        return {
            topLeftRadius: style.borderTopLeftRadius,
            topRightRadius: style.borderTopRightRadius,
            bottomLeftRadius: style.borderBottomLeftRadius,
            bottomRightRadius: style.borderBottomRightRadius,
            bottomBorderWidth: style.borderBottomWidth,
            dragRegion: style.getPropertyValue('--wails-draggable').trim(),
            junctions: [leadingJunction, trailingJunction].map(junction => ({
                content: junction.content,
                width: junction.width,
                height: junction.height,
                background: junction.backgroundImage,
                pointerEvents: junction.pointerEvents,
            })),
        };
    });
    expect(parseFloat(connectedTabPaint.topLeftRadius)).toBeGreaterThan(0);
    expect(parseFloat(connectedTabPaint.topRightRadius)).toBeGreaterThan(0);
    expect(connectedTabPaint.bottomLeftRadius).toBe('0px');
    expect(connectedTabPaint.bottomRightRadius).toBe('0px');
    expect(connectedTabPaint.bottomBorderWidth).toBe('0px');
    expect(connectedTabPaint.dragRegion).toBe('no-drag');
    for (const junction of connectedTabPaint.junctions) {
        expect(junction.content).toBe('\"\"');
        expect(junction.width).toBe(connectedTabPaint.topLeftRadius);
        expect(junction.height).toBe(connectedTabPaint.topLeftRadius);
        expect(junction.background).toContain('radial-gradient');
        expect(junction.pointerEvents).toBe('none');
    }

    const skeletonPaint = await page.locator('.ui-skeleton').first().evaluate(element => {
        const style = getComputedStyle(element);
        const shimmer = getComputedStyle(element, '::after');
        return {
            background: style.backgroundColor,
            radius: style.borderRadius,
            overflow: style.overflow,
            animationName: shimmer.animationName,
        };
    });
    expect(skeletonPaint.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(skeletonPaint.radius).not.toBe('0px');
    expect(skeletonPaint.overflow).toBe('hidden');
    expect(skeletonPaint.animationName).toBe('ui-skeleton-shimmer');

    const foldControl = page.locator('.ui-editor-fold-control[aria-expanded="true"]').first();
    await expect(foldControl).toHaveAttribute('aria-label', 'Collapse code region');
    const foldPaint = await foldControl.evaluate(control => {
        const style = getComputedStyle(control);
        const indicator = getComputedStyle(control, '::before');
        return {
            width: style.width,
            height: style.height,
            radius: style.borderRadius,
            cursor: style.cursor,
            indicatorContent: indicator.content,
            indicatorBorder: indicator.borderRightStyle,
        };
    });
    expect(foldPaint).toEqual({
        width: '18px',
        height: '18px',
        radius: '5px',
        cursor: 'pointer',
        indicatorContent: '""',
        indicatorBorder: 'solid',
    });

    const blockGuide = page.locator('.ui-editor-block-guide[aria-expanded="false"]').first();
    await expect(blockGuide).toHaveText('yaml');
    await expect(blockGuide).toHaveAttribute('aria-label', 'Expand yaml code block');
    expect(await blockGuide.evaluate(control => getComputedStyle(control).cursor)).toBe('pointer');

    const dangerGuide = page.locator('.ui-editor-block-guide--danger');
    await expect(dangerGuide).toHaveText('delete');
    const restingDangerPaint = await dangerGuide.evaluate(control => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--danger-color)';
        document.body.append(probe);
        const result = {
            color: getComputedStyle(control).color,
            danger: getComputedStyle(probe).color,
        };
        probe.remove();
        return result;
    });
    expect(restingDangerPaint.color).not.toBe(restingDangerPaint.danger);
    await dangerGuide.evaluate(button => button.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await dangerGuide.hover();
    await expect(dangerGuide).toHaveCSS('color', restingDangerPaint.danger);
    await dangerGuide.focus();
    await expect(dangerGuide).toHaveCSS('color', restingDangerPaint.danger);

    const resizeHandle = page.getByRole('button', { name: 'Resize image width' });
    const resizePaint = await resizeHandle.evaluate(control => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--accent-color)';
        document.body.appendChild(probe);
        const style = getComputedStyle(control);
        const dot = getComputedStyle(control, '::after');
        const result = {
            width: style.width,
            height: style.height,
            border: style.borderTopWidth,
            background: style.backgroundColor,
            cursor: style.cursor,
            touchAction: style.touchAction,
            dotWidth: dot.width,
            dotHeight: dot.height,
            dotRadius: dot.borderRadius,
            dotBackground: dot.backgroundColor,
            accent: getComputedStyle(probe).color,
        };
        probe.remove();
        return result;
    });
    expect(resizePaint).toEqual({
        width: '28px',
        height: '28px',
        border: '0px',
        background: 'rgba(0, 0, 0, 0)',
        cursor: 'ew-resize',
        touchAction: 'none',
        dotWidth: '11px',
        dotHeight: '11px',
        dotRadius: '50%',
        dotBackground: resizePaint.accent,
        accent: resizePaint.accent,
    });
    await resizeHandle.focus();
    await expect.poll(() => resizeHandle.evaluate(control => (
        getComputedStyle(control, '::after').width
    ))).toBe('13px');
    expect(await resizeHandle.evaluate(control => (
        getComputedStyle(control, '::after').boxShadow
    ))).not.toBe('none');

    const search = page.getByLabel('Find a component');
    await search.fill('compact action');
    await expect(page.locator('#buttons-actions')).toBeVisible();
    await expect(page.locator('#foundations')).toBeHidden();
    await expect(page.locator('#catalog-visible-count')).toHaveText('1 of 12 groups');

    await search.fill('');
    await expect(page.locator('[data-catalog-section]:visible')).toHaveCount(12);
    await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});

test('opens directly from the filesystem with its styles and eager catalogue behavior', async ({ page }) => {
    const errors = [];
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(pathToFileURL(path.resolve('frontend/design-system/index.html')).href);

    await expect(page.getByRole('heading', { name: 'Every visible pattern, in one place.' })).toBeVisible();
    await expect(page.locator('.catalog-layout')).toHaveCSS('display', 'grid');
    await expect(page.locator('[data-catalog-section]')).toHaveCount(12);

    const themeSelect = page.locator('#theme-select');
    await expect(themeSelect.locator('option')).toHaveCount(18);
    await expect(page.locator('#theme-status')).toHaveText('18 themes · Figaro Dark');
    await themeSelect.selectOption('figaro-light');
    await expect(page.locator('#catalog-theme')).toHaveAttribute('href', '../themes/figaro-light.css');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'figaro-light');
    await expect(page.locator('[data-token="--accent-color"] .ds-token-value')).toHaveText('#b94a3e');

    const logoLoaded = await page.locator('.catalog-brand img').evaluate(image => ({
        complete: image.complete,
        width: image.naturalWidth,
    }));
    expect(logoLoaded).toEqual({ complete: true, width: 32 });
    expect(errors).toEqual([]);
});
