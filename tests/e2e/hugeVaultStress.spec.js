import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import stressVault from '../../scripts/stressVaultPlan.cjs';

const stressVaultPath = process.env.FIGARO_STRESS_VAULT;
const browserReportPath = process.env.FIGARO_STRESS_BROWSER_REPORT;

function fixtureTree(documents) {
    const root = { children: new Map() };
    for (const document of documents) {
        const parts = document.path.split('/');
        let parent = root;
        let currentPath = '';
        parts.forEach((part, index) => {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const file = index === parts.length - 1;
            if (!parent.children.has(part)) {
                parent.children.set(part, file
                    ? { name: part, path: currentPath, type: 'file', mtime: 1 }
                    : { name: part, path: currentPath, type: 'directory', children: new Map() });
            }
            if (!file) parent = parent.children.get(part);
        });
    }

    const materialize = node => [...node.children.values()]
        .sort((left, right) => {
            if (left.type !== right.type) return left.type === 'directory' ? -1 : 1;
            return left.name.toLocaleLowerCase().localeCompare(right.name.toLocaleLowerCase());
        })
        .map(item => item.type === 'directory'
            ? { ...item, children: materialize(item) }
            : item);
    return materialize(root);
}

function directoryPaths(items, result = []) {
    for (const item of items) {
        if (item.type !== 'directory') continue;
        result.push(item.path);
        directoryPaths(item.children || [], result);
    }
    return result;
}

function materializeBrowserFixture(manifest, plan, smallContent, hugeContent) {
    const tree = fixtureTree(plan.documents);
    const commonResults = plan.documents.map((document, index) => ({
        path: document.path,
        name: document.path.split('/').pop(),
        matches: [{ line: 3, text: `Shared marker ${manifest.needles.common}` }],
        match_count: 1,
        mtime: index + 1,
    }));
    const rareResults = commonResults.filter(result => result.path === manifest.sources.huge || result.path.includes('huge-copy'))
        .map(result => ({
            ...result,
            matches: [{ line: manifest.hugeLineCount, text: `Tail ${manifest.needles.rare}` }],
        }));
    const todo = plan.documents.filter(document => document.template === 'small').map((document, index) => ({
        file: document.path,
        file_name: document.path.split('/').pop(),
        line: 5,
        text: 'Review this generated note',
        tag: 'todo',
        mtime: index + 1,
    }));
    const review = plan.documents.filter(document => document.template === 'huge').map((document, index) => ({
        file: document.path,
        file_name: document.path.split('/').pop(),
        line: 4,
        text: 'Inspect the large editor buffer',
        tag: 'review',
        mtime: index + 1,
    }));
    const backlinks = plan.documents.map((document, index) => ({
        path: document.path,
        name: document.path.split('/').pop(),
        line_num: document.template === 'huge' ? 5 : 7,
        snippet: '[2026-08-11](/2026-08-11.md)',
        context: 'The generated note links to 2026-08-11 for scale testing.',
        match_text: '2026-08-11',
        mtime: index + 1,
    }));
    const graphNodes = plan.documents.map((document, index) => ({
        path: document.path,
        name: `Note ${index}`,
        group: document.path.includes('/') ? document.path.split('/')[0] : 'Vault root',
        mtime: index + 1,
    }));
    const graphEdges = graphNodes.slice(1).map(node => ({
        source: node.path,
        target: graphNodes[0].path,
    }));
    return {
        manifest,
        tree,
        directories: directoryPaths(tree),
        commonResults,
        rareResults,
        board: { review, todo, wip: [], done: [] },
        backlinks,
        graph: { nodes: graphNodes, edges: graphEdges },
        smallContent,
        hugeContent,
    };
}

function browserFixture(vaultPath) {
    const manifest = JSON.parse(fs.readFileSync(path.join(vaultPath, '.figaro-stress-vault.json'), 'utf8'));
    const plan = stressVault.buildStressVaultPlan({
        documentCount: manifest.documentCount,
        hugeDocumentCount: manifest.hugeDocumentCount,
        hugeLineCount: manifest.hugeLineCount,
    });
    return materializeBrowserFixture(
        manifest,
        plan,
        fs.readFileSync(path.join(vaultPath, manifest.sources.small), 'utf8'),
        fs.readFileSync(path.join(vaultPath, manifest.sources.huge), 'utf8'),
    );
}

function largeCollectionContractFixture() {
    const plan = stressVault.buildStressVaultPlan({
        documentCount: 160,
        hugeDocumentCount: 3,
        hugeLineCount: 320,
    });
    const manifest = {
        format: 1,
        documentCount: plan.documentCount,
        smallDocumentCount: plan.smallDocumentCount,
        hugeDocumentCount: plan.hugeDocumentCount,
        hugeLineCount: plan.hugeLineCount,
        sources: plan.sources,
        needles: plan.needles,
    };
    return materializeBrowserFixture(
        manifest,
        plan,
        stressVault.smallDocumentContent(),
        stressVault.hugeDocumentContent(plan.hugeLineCount),
    );
}

async function installFixtureBackend(page, fixture) {
    await page.addInitScript(data => {
        window.__stressNavigationStarted = performance.now();
        window.__stressLongTasks = [];
        try {
            const observer = new PerformanceObserver(entries => {
                for (const entry of entries.getEntries()) {
                    window.__stressLongTasks.push({ start: entry.startTime, duration: entry.duration });
                }
            });
            observer.observe({ type: 'longtask', buffered: true });
        } catch (_) { /* Long Task timing is optional in embedded Chromium builds. */ }

        const calls = [];
        const mock = value => Promise.resolve(value);
        const responses = {
            GetFileTree: () => mock(data.tree),
            GetVaultLoadStatus: () => mock({ generation: 1, phase: 'ready', loaded: 1, total: 1 }),
            GetFileTreeStyles: () => mock({ version: 1, entries: {}, recent_icons: [] }),
            ReadFile: filePath => mock({
                content: filePath === data.manifest.sources.huge ? data.hugeContent : data.smallContent,
                path: filePath,
                mtime: 1,
            }),
            SearchFiles: query => mock(query === data.manifest.needles.common
                ? data.commonResults
                : query === data.manifest.needles.rare ? data.rareResults : []),
            SearchNotes: query => mock({
                results: query === data.manifest.needles.common
                    ? data.commonResults
                    : query === data.manifest.needles.rare ? data.rareResults : [],
                suggestion: '',
            }),
            SearchBacklinks: target => mock(String(target).includes('2026-08-11') ? data.backlinks : []),
            SearchUnlinkedMentions: () => mock([]),
            GetKanbanColumns: () => mock({ columns: ['review', 'todo', 'wip', 'done'], colors: {} }),
            GetKanbanBoard: () => mock(data.board),
            GetTaskSchedules: () => mock([]),
            GetVaultGraph: () => mock(data.graph),
            GetHomeTasks: limit => mock(data.board.todo.slice(0, Number(limit) || 6)),
            GetDueTaskSummary: () => mock({ due_today: 0, overdue: 0 }),
            GetCalendarMonthData: () => mock({ year: 2026, month: 8, days_with_notes: [11], days_with_links: [11], days_with_due_tasks: [], calendar: [] }),
            GetLinkedNotesForDate: () => mock([]),
            GetVaultHealth: () => mock({ broken_links: [], orphan_attachments: [], duplicate_names: [], similar_notes: [], invalid_frontmatter: [] }),
            LoadSession: () => mock({}),
            LinkStyleLoad: () => mock({ style: 'markdown' }),
            GetThemes: () => mock({ themes: [{ id: 'default', name: 'Figaro Dark' }] }),
            GetThemeCSS: () => mock({ css: '' }),
            ThemeLoad: () => mock({ theme: 'default', font: 'inter', codeFont: 'theme-mono' }),
            VimLoad: () => mock({ enabled: false }),
            VimVisualRowsLoad: () => mock({ enabled: false }),
            VimRevealBlocksLoad: () => mock({ enabled: false }),
            TabSizeLoad: () => mock({ size: 4 }),
            LineNumbersLoad: () => mock({ enabled: false }),
            MarkdownLintLoad: () => mock({ enabled: false }),
            EditorNavigationLoad: () => mock({ stickyHeadings: true, blockGuides: true, documentOutline: true }),
            SpellcheckLoad: () => mock({ enabled: false, language: 'en-US' }),
            AutoCommitLoad: () => mock(false),
            AutoSaveLoad: () => mock(0),
            GetLaunchExternalFiles: () => mock([]),
            GetApplicationVersion: () => mock('Stress fixture'),
            GetOSUsername: () => mock('Stress User'),
            GetTodayLink: () => mock('2026-08-11'),
            GetTomorrowLink: () => mock('2026-08-12'),
            GetYesterdayLink: () => mock('2026-08-10'),
            SaveSession: () => mock({ success: true }),
            SaveFile: () => mock({ success: true, mtime: 2 }),
            SetKanbanCardOrder: (column, refs) => {
                const cards = data.board[column] || [];
                const byReference = new Map(cards.map(card => [
                    `${card.file}\u0000${Number(card.line)}`,
                    card,
                ]));
                data.board[column] = refs.map(ref => (
                    byReference.get(`${ref.file}\u0000${Number(ref.line)}`)
                )).filter(Boolean);
                return mock({ success: true });
            },
            UpdateTaskTag: (file, line, oldTag, newTag) => {
                const source = data.board[oldTag] || [];
                const index = source.findIndex(card => card.file === file && Number(card.line) === Number(line));
                if (index >= 0) {
                    const [card] = source.splice(index, 1);
                    card.tag = newTag;
                    if (!Array.isArray(data.board[newTag])) data.board[newTag] = [];
                    data.board[newTag].push(card);
                }
                return mock({ success: index >= 0 });
            },
            WindowSetTitle: () => mock(undefined),
        };
        window.__stressBackendCalls = calls;
        window.go = {
            desktop: {
                App: new Proxy({}, {
                    get: (_target, method) => method === 'then' ? undefined : (...args) => {
                        calls.push({ method: String(method), args });
                        const handler = responses[method];
                        return handler ? handler(...args) : mock({ success: true });
                    },
                }),
            },
        };
    }, fixture);
}

async function beginMetric(page) {
    await page.evaluate(() => {
        window.__stressMetricStart = performance.now();
        window.__stressMetricLongTaskStart = window.__stressLongTasks.length;
    });
}

async function finishMetric(page, name, details = {}) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return page.evaluate(({ metricName, extra }) => {
        const longTasks = window.__stressLongTasks.slice(window.__stressMetricLongTaskStart || 0);
        const memory = performance.memory;
        return {
            name: metricName,
            elapsedMs: Math.round((performance.now() - window.__stressMetricStart) * 10) / 10,
            longTaskCount: longTasks.length,
            longestTaskMs: Math.round(Math.max(0, ...longTasks.map(task => task.duration)) * 10) / 10,
            longTaskTotalMs: Math.round(longTasks.reduce((sum, task) => sum + task.duration, 0) * 10) / 10,
            domNodes: document.getElementsByTagName('*').length,
            usedJSHeapBytes: memory?.usedJSHeapSize || null,
            ...extra,
        };
    }, { metricName: name, extra: details });
}

async function reloadStressApp(page) {
    await page.goto('/');
    await page.waitForFunction(() => window._appReady === true);
    await page.waitForFunction(() => window.__stressBackendCalls.some(call => call.method === 'GetKanbanBoard'));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function isolatedScenario(context, metrics, failureName, run) {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    try {
        await reloadStressApp(page);
        await run(page);
    } catch (error) {
        metrics.push({
            name: failureName,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
        });
    } finally {
        await page.close().catch(() => {});
    }
}

function writeBrowserReport(context, fixture, metrics) {
    const report = {
        vault: stressVaultPath ? path.resolve(stressVaultPath) : '',
        browser: context.browser()?.version() || 'unknown',
        manifest: fixture.manifest,
        metrics,
    };
    if (browserReportPath) {
        fs.mkdirSync(path.dirname(browserReportPath), { recursive: true });
        fs.writeFileSync(browserReportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    return report;
}

async function pressRepeatedly(page, key, count) {
    for (let index = 0; index < count; index += 1) {
        await page.keyboard.press(key);
    }
}

async function waitForGraphPaint(page) {
    await page.waitForFunction(() => (
        document.querySelector('.graph-canvas')?.dataset.renderState === 'ready'
    ));
}

test('preserves keyboard reachability and focus beyond a large collection window', async ({ context }) => {
    test.setTimeout(2 * 60 * 1000);
    const fixture = largeCollectionContractFixture();
    await installFixtureBackend(context, fixture);

    const treePage = await context.newPage();
    await reloadStressApp(treePage);
    await treePage.evaluate(async directories => {
        const state = await import('/js/state.js');
        const tree = await import('/js/fileTree.js');
        state.setState('expandedDirs', new Set(directories));
        tree.renderFileTree();
    }, fixture.directories);
    const firstTreeRow = treePage.locator('#file-tree .file-tree-node[role="treeitem"]').first();
    const firstTreePath = await firstTreeRow.evaluate(row => row.closest('.file-tree-item')?.dataset.path);
    await firstTreeRow.focus();
    await treePage.keyboard.press('End');
    await expect.poll(() => treePage.evaluate(() => (
        document.activeElement?.closest('.file-tree-item')?.dataset.path
    ))).toBe(fixture.manifest.sources.small);
    await treePage.keyboard.press('Home');
    await expect.poll(() => treePage.evaluate(() => (
        document.activeElement?.closest('.file-tree-item')?.dataset.path
    ))).toBe(firstTreePath);
    const expectedTreeTarget = await treePage.evaluate(async minimumIndex => {
        const state = await import('/js/state.js');
        const model = await import('/js/core/fileTreeModel.js');
        const rows = model.visibleFileTreeRows(
            state.getState('fileTreeData'),
            state.getState('expandedDirs'),
        );
        const index = rows.findIndex((row, rowIndex) => rowIndex >= minimumIndex && row.type === 'file');
        return { index, path: rows[index]?.path };
    }, 121);
    await pressRepeatedly(treePage, 'ArrowDown', expectedTreeTarget.index);
    await expect.poll(() => treePage.evaluate(() => (
        document.activeElement?.closest('.file-tree-item')?.dataset.path
    ))).toBe(expectedTreeTarget.path);
    await treePage.keyboard.press('Shift+F10');
    await expect(treePage.locator('.context-menu')).toBeVisible();
    await treePage.keyboard.press('Escape');
    await expect.poll(() => treePage.evaluate(() => (
        document.activeElement?.closest('.file-tree-item')?.dataset.path
    ))).toBe(expectedTreeTarget.path);
    await treePage.keyboard.press('Enter');
    await expect.poll(() => treePage.evaluate(expectedPath => (
        window.__stressBackendCalls.some(call => call.method === 'ReadFile' && call.args[0] === expectedPath)
    ), expectedTreeTarget.path)).toBe(true);
    await treePage.close();

    const searchPage = await context.newPage();
    await reloadStressApp(searchPage);
    const searchSteps = 121;
    await searchPage.evaluate(async query => {
        const input = document.getElementById('global-search-input');
        input.value = query;
        input.focus();
        const search = await import('/js/controllers/searchController.js');
        await search.performGlobalSearch(query);
    }, fixture.manifest.needles.common);
    const expectedSearchPath = await searchPage.evaluate(async index => (
        (await import('/js/state.js')).getState('searchResults')[index]?.path
    ), searchSteps - 1);
    const lastSearchPath = await searchPage.evaluate(async () => (
        (await import('/js/state.js')).getState('searchResults').at(-1)?.path
    ));
    await searchPage.locator('#global-search-dropdown').evaluate(dropdown => {
        dropdown.scrollTop = dropdown.scrollHeight;
        dropdown.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => searchPage.locator('.search-result-row').last().getAttribute('data-ui-tooltip'))
        .toBe(lastSearchPath);
    await pressRepeatedly(searchPage, 'ArrowDown', searchSteps);
    await expect.poll(() => searchPage.evaluate(() => {
        const input = document.getElementById('global-search-input');
        const active = document.getElementById(input.getAttribute('aria-activedescendant'));
        return {
            inputFocused: document.activeElement === input,
            activeMounted: Boolean(active),
            selected: active?.getAttribute('aria-selected'),
            path: active?.getAttribute('data-ui-tooltip'),
        };
    })).toEqual({
        inputFocused: true,
        activeMounted: true,
        selected: 'true',
        path: expectedSearchPath,
    });
    await searchPage.keyboard.press('Enter');
    await expect.poll(() => searchPage.evaluate(expectedPath => (
        window.__stressBackendCalls.some(call => call.method === 'ReadFile' && call.args[0] === expectedPath)
    ), expectedSearchPath)).toBe(true);
    await searchPage.close();

    const kanbanPage = await context.newPage();
    await reloadStressApp(kanbanPage);
    await kanbanPage.locator('#sidebar-kanban').click();
    const todoCards = kanbanPage.locator('.kanban-column-cards[data-column="todo"] .kanban-card');
    await expect(todoCards.first()).toBeVisible();
    await todoCards.first().focus();
    const kanbanSteps = 110;
    const expectedKanbanCard = fixture.board.todo[kanbanSteps];
    await pressRepeatedly(kanbanPage, 'Tab', kanbanSteps);
    await expect.poll(() => kanbanPage.evaluate(() => ({
        file: document.activeElement?.dataset.file,
        tag: document.activeElement?.dataset.tag,
    }))).toEqual({ file: expectedKanbanCard.file, tag: 'todo' });
    await kanbanPage.keyboard.press('ArrowDown');
    await expect(kanbanPage.locator('#status-text')).toContainText('Task reordered');
    await expect.poll(() => kanbanPage.evaluate(() => document.activeElement?.dataset.file))
        .toBe(expectedKanbanCard.file);
    const reorderedCard = kanbanPage.locator(
        `.kanban-card[data-file="${expectedKanbanCard.file}"][data-tag="todo"]`,
    );
    await reorderedCard.dragTo(kanbanPage.locator('.kanban-column[data-column="review"]'));
    await expect.poll(() => kanbanPage.evaluate(expectedFile => (
        window.__stressBackendCalls.some(call => (
            call.method === 'UpdateTaskTag'
            && call.args[0] === expectedFile
            && call.args[2] === 'todo'
            && call.args[3] === 'review'
        ))
    ), expectedKanbanCard.file)).toBe(true);
    await expect(kanbanPage.locator(
        `.kanban-column[data-column="review"] .kanban-card[data-file="${expectedKanbanCard.file}"]`,
    )).toBeVisible();
    await kanbanPage.close();

    const relationshipsPage = await context.newPage();
    await reloadStressApp(relationshipsPage);
    await relationshipsPage.evaluate(async sourcePath => {
        const app = await import('/js/app.js');
        await app.handleFileOpen(sourcePath);
    }, fixture.manifest.sources.small);
    await expect(relationshipsPage.locator('#backlinks-status'))
        .toContainText(`${fixture.manifest.documentCount} backlinks`);
    await relationshipsPage.locator('#backlinks-status').focus();
    await relationshipsPage.keyboard.press('Space');
    const relationshipButtons = relationshipsPage.locator('.relationship-open');
    await expect(relationshipButtons.first()).toBeVisible();
    await relationshipButtons.first().focus();
    await pressRepeatedly(relationshipsPage, 'Tab', fixture.backlinks.length - 1);
    await expect.poll(() => relationshipsPage.evaluate(() => (
        document.activeElement?.closest('.relationship-card')?.dataset.path
    ))).toBe(fixture.backlinks.at(-1).path);
    await relationshipsPage.close();
});

test('profiles the generated 10,000-document vault at real browser layout boundaries', async ({ context }) => {
    test.skip(!stressVaultPath, 'set FIGARO_STRESS_VAULT to run the huge-vault browser profile');
    test.setTimeout(10 * 60 * 1000);

    const fixture = browserFixture(path.resolve(stressVaultPath));
    const metrics = [];
    await installFixtureBackend(context, fixture);

    await isolatedScenario(context, metrics, 'file_tree_scenario', async page => {
        metrics.push(await page.evaluate(() => {
            const longTasks = window.__stressLongTasks;
            return {
                name: 'startup_collapsed_tree',
                status: 'completed',
                elapsedMs: Math.round((performance.now() - window.__stressNavigationStarted) * 10) / 10,
                longTaskCount: longTasks.length,
                longestTaskMs: Math.round(Math.max(0, ...longTasks.map(task => task.duration)) * 10) / 10,
                longTaskTotalMs: Math.round(longTasks.reduce((sum, task) => sum + task.duration, 0) * 10) / 10,
                domNodes: document.getElementsByTagName('*').length,
                mountedTreeRows: document.querySelectorAll('.file-tree-node').length,
                usedJSHeapBytes: performance.memory?.usedJSHeapSize || null,
            };
        }));

        await beginMetric(page);
        await page.evaluate(async directories => {
            const state = await import('/js/state.js');
            const tree = await import('/js/fileTree.js');
            state.setState('expandedDirs', new Set(directories));
            tree.renderFileTree();
        }, fixture.directories);
        const logicalTreeRows = fixture.manifest.documentCount + fixture.directories.length;
        await expect.poll(() => page.evaluate(async () => {
            const state = await import('/js/state.js');
            const model = await import('/js/core/fileTreeModel.js');
            return model.visibleFileTreeRows(
                state.getState('fileTreeData'),
                state.getState('expandedDirs'),
            ).length;
        })).toBe(logicalTreeRows);
        metrics.push(await finishMetric(page, 'file_tree_expand_all', {
            status: 'completed',
            logicalTreeRows,
            mountedTreeRows: await page.locator('.file-tree-node').count(),
        }));
    });
    writeBrowserReport(context, fixture, metrics);

    await isolatedScenario(context, metrics, 'huge_editor_scenario', async page => {
        await beginMetric(page);
        await page.evaluate(async sourcePath => {
            const app = await import('/js/app.js');
            await app.handleFileOpen(sourcePath);
        }, fixture.manifest.sources.huge);
        await page.waitForFunction(async expectedLines => {
            const editor = await import('/js/editor.js');
            return editor.getEditorView()?.state?.doc?.lines >= expectedLines;
        }, fixture.manifest.hugeLineCount);
        await page.waitForFunction(async () => (
            (await import('/js/editor.js')).getEditorView()?.dom
                ?.dataset.markdownPresentationState === 'ready'
        ));
        metrics.push(await finishMetric(page, 'open_huge_10000_line_document', {
            status: 'completed',
            editorLines: await page.evaluate(async () => (await import('/js/editor.js')).getEditorView().state.doc.lines),
            mountedEditorLines: await page.locator('.cm-line').count(),
        }));

        const cursorLine = Math.floor(fixture.manifest.hugeLineCount / 2);
        await page.evaluate(async lineNumber => {
            const view = (await import('/js/editor.js')).getEditorView();
            view.dispatch({
                selection: { anchor: view.state.doc.line(lineNumber).from },
                scrollIntoView: true,
            });
            view.focus();
        }, cursorLine);
        await page.keyboard.press('ArrowDown');
        await expect.poll(() => page.evaluate(async () => {
            const view = (await import('/js/editor.js')).getEditorView();
            return view.state.doc.lineAt(view.state.selection.main.head).number;
        })).toBe(cursorLine + 1);
        await page.keyboard.press('ArrowUp');
        await expect.poll(() => page.evaluate(async () => {
            const view = (await import('/js/editor.js')).getEditorView();
            return view.state.doc.lineAt(view.state.selection.main.head).number;
        })).toBe(cursorLine);

        await beginMetric(page);
        await page.evaluate(async () => {
            const view = (await import('/js/editor.js')).getEditorView();
            view.dispatch({ changes: { from: view.state.doc.length, insert: 'x' } });
        });
        metrics.push(await finishMetric(page, 'edit_huge_document_tail', { status: 'completed' }));
    });
    writeBrowserReport(context, fixture, metrics);

    await isolatedScenario(context, metrics, 'rare_search_scenario', async page => {
        await beginMetric(page);
        await page.evaluate(async query => {
            const search = await import('/js/controllers/searchController.js');
            await search.performGlobalSearch(query);
        }, fixture.manifest.needles.rare);
        await expect.poll(() => page.evaluate(async () => (
            (await import('/js/state.js')).getState('searchResults')?.length
        ))).toBe(fixture.manifest.hugeDocumentCount);
        await expect(page.locator('.search-result-row').first()).toBeVisible();
        metrics.push(await finishMetric(page, 'search_rare_5_results', {
            status: 'completed',
            logicalRows: fixture.manifest.hugeDocumentCount,
            renderedRows: await page.locator('.search-result-row').count(),
        }));
    });
    writeBrowserReport(context, fixture, metrics);

    await isolatedScenario(context, metrics, 'common_search_scenario', async page => {
        await beginMetric(page);
        await page.evaluate(async query => {
            const search = await import('/js/controllers/searchController.js');
            await search.performGlobalSearch(query);
        }, fixture.manifest.needles.common);
        await expect.poll(() => page.evaluate(async () => (
            (await import('/js/state.js')).getState('searchResults')?.length
        ))).toBe(fixture.manifest.documentCount);
        await expect(page.locator('.search-result-row').first()).toBeVisible();
        metrics.push(await finishMetric(page, 'search_common_10000_results', {
            status: 'completed',
            logicalRows: fixture.manifest.documentCount,
            renderedRows: await page.locator('.search-result-row').count(),
        }));

        await beginMetric(page);
        await page.evaluate(query => {
            const input = document.getElementById('global-search-input');
            input.value = query;
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        }, fixture.manifest.needles.common);
        await expect(page.locator('.search-result-row.selected')).toHaveCount(1);
        metrics.push(await finishMetric(page, 'search_arrow_rerender_10000_results', { status: 'completed' }));
    });
    writeBrowserReport(context, fixture, metrics);

    await isolatedScenario(context, metrics, 'kanban_scenario', async page => {
        await beginMetric(page);
        await page.locator('#sidebar-kanban').click();
        await expect.poll(() => page.evaluate(async () => {
            const board = (await import('/js/state.js')).getState('kanbanBoardData') || {};
            return Object.values(board).reduce((count, cards) => count + cards.length, 0);
        }), { timeout: 120000 }).toBe(fixture.manifest.documentCount);
        await expect(page.locator('.kanban-card').first()).toBeVisible();
        metrics.push(await finishMetric(page, 'kanban_render_10000_cards', {
            status: 'completed',
            logicalCards: fixture.manifest.documentCount,
            renderedCards: await page.locator('.kanban-card').count(),
        }));

        await beginMetric(page);
        await page.locator('.kanban-column-cards[data-column="todo"] .kanban-card').first().focus();
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('#status-text')).toContainText('Task reordered', { timeout: 120000 });
        metrics.push(await finishMetric(page, 'kanban_arrow_rerender_10000_cards', { status: 'completed' }));
    });
    writeBrowserReport(context, fixture, metrics);

    await isolatedScenario(context, metrics, 'graph_scenario', async page => {
        await beginMetric(page);
        await page.locator('#sidebar-graph').click();
        await expect(page.locator('#graph-status-count')).toHaveText(
            `${fixture.manifest.documentCount} notes · ${fixture.manifest.documentCount - 1} links`,
            { timeout: 120000 },
        );
        await waitForGraphPaint(page);
        metrics.push(await finishMetric(page, 'graph_render_10000_nodes', {
            status: 'completed',
            logicalNodes: fixture.manifest.documentCount,
            logicalEdges: fixture.manifest.documentCount - 1,
            canvasCount: await page.locator('.graph-canvas').count(),
        }));

        await beginMetric(page);
        await page.locator('.graph-filter-input').fill('note');
        await expect(page.locator('#graph-status-count')).toHaveText(
            `${fixture.manifest.documentCount} notes · ${fixture.manifest.documentCount - 1} links`,
        );
        await waitForGraphPaint(page);
        metrics.push(await finishMetric(page, 'graph_filter_10000_nodes', { status: 'completed' }));

        await beginMetric(page);
        await page.locator('.graph-canvas').press(']');
        await expect(page.locator('#graph-status-selection')).not.toHaveText('No note selected');
        await waitForGraphPaint(page);
        metrics.push(await finishMetric(page, 'graph_select_10000_nodes', { status: 'completed' }));

        await beginMetric(page);
        await page.locator('.graph-zoom-in').click();
        await waitForGraphPaint(page);
        metrics.push(await finishMetric(page, 'graph_zoom_10000_nodes', { status: 'completed' }));
    });
    writeBrowserReport(context, fixture, metrics);

    await isolatedScenario(context, metrics, 'backlinks_scenario', async page => {
        await page.evaluate(async sourcePath => {
            const app = await import('/js/app.js');
            await app.handleFileOpen(sourcePath);
        }, fixture.manifest.sources.small);
        await expect(page.locator('#backlinks-status')).toContainText(`${fixture.manifest.documentCount} backlinks`);
        await beginMetric(page);
        await page.locator('#status-bar').hover();
        await page.locator('#backlinks-status').click({ timeout: 10000 });
        await expect(page.locator('.relationship-count').first())
            .toHaveText(String(fixture.manifest.documentCount), { timeout: 120000 });
        await expect(page.locator('.relationship-card').first()).toBeVisible();
        metrics.push(await finishMetric(page, 'backlinks_render_10000_cards', {
            status: 'completed',
            logicalCards: fixture.manifest.documentCount,
            renderedCards: await page.locator('.relationship-card').count(),
        }));
    });
    const report = writeBrowserReport(context, fixture, metrics);

    for (const metric of metrics) {
        console.log(`stress ${metric.name} ${JSON.stringify(metric)}`);
    }
    expect(report.metrics).toBe(metrics);
    expect(metrics.some(metric => metric.name === 'startup_collapsed_tree')).toBe(true);
});
