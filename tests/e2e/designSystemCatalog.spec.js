import { expect, test } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('catalogues current elements with themed combobox geometry and seamless steppers', async ({ page }) => {
    await page.goto('/design-system/');

    await expect(page.getByRole('heading', { name: 'Every visible pattern, in one place.' })).toBeVisible();
    await expect(page.locator('[data-catalog-section]')).toHaveCount(12);

    const themeSelect = page.locator('#theme-select');
    await expect(themeSelect.locator('option')).toHaveCount(18);
    await expect(themeSelect).toHaveValue('default');
    await expect(page.locator('#theme-status')).toHaveText('18 themes · Figaro Dark');
    await expect(page.locator('[data-token="--accent-color"] .ds-token-value')).toHaveText('#d8574a');

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
    await tooltipTrigger.focus();
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
    const autoSaveMenu = autoSavePicker.locator('.select-combobox-menu');
    await expect(autoSaveSource).toHaveClass(/select-combobox-native/);
    await autoSaveTrigger.click();
    await expect(autoSaveTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(autoSaveMenu).toBeVisible();

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
            borderToken: resolveColor('var(--border-color)'),
        };
    });
    expect(themedPopup.background).toBe(themedPopup.panelToken);
    expect(themedPopup.color).toBe(themedPopup.textToken);
    expect(themedPopup.border).toBe(themedPopup.borderToken);

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
    const appearanceMenu = appearancePicker.locator('.ui-picker-menu');
    await expect(appearanceMenu).toHaveAttribute('aria-label', 'Theme options');
    await appearanceTrigger.focus();
    await appearanceTrigger.press('ArrowDown');
    await expect(appearanceMenu).toBeVisible();
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

    const primitiveFamilies = {
        '.ui-picker': 3,
        '.ui-stepper': 2,
        '.ui-button': 12,
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
        '.ui-spinner': 1,
        '.ui-skeleton': 6,
    };
    for (const [selector, minimum] of Object.entries(primitiveFamilies)) {
        expect(await page.locator(selector).count()).toBeGreaterThanOrEqual(minimum);
    }

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
        return {
            topLeftRadius: style.borderTopLeftRadius,
            topRightRadius: style.borderTopRightRadius,
            bottomLeftRadius: style.borderBottomLeftRadius,
            bottomRightRadius: style.borderBottomRightRadius,
            bottomBorderWidth: style.borderBottomWidth,
            dragRegion: style.getPropertyValue('--wails-draggable').trim(),
        };
    });
    expect(parseFloat(connectedTabPaint.topLeftRadius)).toBeGreaterThan(0);
    expect(parseFloat(connectedTabPaint.topRightRadius)).toBeGreaterThan(0);
    expect(connectedTabPaint.bottomLeftRadius).toBe('0px');
    expect(connectedTabPaint.bottomRightRadius).toBe('0px');
    expect(connectedTabPaint.bottomBorderWidth).toBe('0px');
    expect(connectedTabPaint.dragRegion).toBe('no-drag');

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
    await dangerGuide.hover();
    await expect(dangerGuide).toHaveCSS('color', restingDangerPaint.danger);
    await dangerGuide.focus();
    await expect(dangerGuide).toHaveCSS('color', restingDangerPaint.danger);

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
