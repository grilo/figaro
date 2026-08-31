import { backend } from './backend.js';
import { log } from './log.js';

let openWorkspaceTab = null;

export function configureVaultHealthWorkspace({ openTab } = {}) {
    if (typeof openTab !== 'function') throw new TypeError('Vault Health openTab port is required');
    openWorkspaceTab = openTab;
}

function openTab(...args) {
    if (!openWorkspaceTab) throw new Error('Vault Health workspace ports were not configured');
    return openWorkspaceTab(...args);
}

const healthSections = [
    { key: 'broken_links', title: 'Broken links', empty: 'All vault-local links resolve.' },
    { key: 'orphan_attachments', title: 'Orphan attachments', empty: 'Every tracked attachment is referenced.' },
    { key: 'duplicate_names', title: 'Repeated filenames', empty: 'No filenames are repeated in multiple locations.', informational: true },
    { key: 'similar_notes', title: 'Possible duplicate notes', empty: 'No similar note names need review.' },
    { key: 'invalid_frontmatter', title: 'Frontmatter', empty: 'No unclosed frontmatter found.' },
];

export async function renderVaultHealth(panel) {
    panel.innerHTML = `
        <div class="vault-health-view">
            <header class="vault-health-header">
                <div>
                    <p class="vault-health-kicker">Vault care</p>
                    <h2>Vault health</h2>
                    <p>Review read-only maintenance findings without changing your notes.</p>
                </div>
                <button type="button" class="ui-button ui-button--primary vault-health-scan">Run scan</button>
            </header>
            <div class="ui-notice vault-health-summary" aria-live="polite"></div>
            <div class="vault-health-results" aria-live="polite"></div>
        </div>`;

    const scan = () => loadVaultHealth(panel);
    panel.querySelector('.vault-health-scan').addEventListener('click', scan);
    panel.querySelector('.vault-health-results').addEventListener('click', event => {
        const open = event.target.closest('.vault-health-open');
        if (!open) return;
        openHealthIssue(open);
    });
    await scan();
}

export function normalizeVaultHealth(report) {
    if (!report || typeof report !== 'object' || Array.isArray(report)) {
        throw new TypeError('Vault health response was not a report');
    }
    const normalized = {};
    for (const { key } of healthSections) {
        const issues = report[key];
        if (issues == null) normalized[key] = [];
        else if (Array.isArray(issues)) normalized[key] = issues;
        else throw new TypeError(`Vault health ${key} was not a list`);
    }
    return normalized;
}

async function loadVaultHealth(panel) {
    const results = panel.querySelector('.vault-health-results');
    const summary = panel.querySelector('.vault-health-summary');
    const button = panel.querySelector('.vault-health-scan');
    if (!results || !summary || !button) return;
    button.disabled = true;
    button.textContent = 'Scanning…';
    results.innerHTML = '<div class="vault-health-loading">Reviewing local links, attachments, names, and frontmatter…</div>';
    summary.textContent = '';
    try {
        const report = normalizeVaultHealth(await backend().GetVaultHealth());
        if (!panel.isConnected) return;
        const actionableTotal = healthSections
            .filter(section => !section.informational)
            .reduce((count, section) => count + report[section.key].length, 0);
        const repeatedTotal = report.duplicate_names.length;
        const repeatedSummary = repeatedTotal > 0
            ? ` ${repeatedTotal} repeated ${repeatedTotal === 1 ? 'filename is' : 'filenames are'} listed for reference.`
            : '';
        summary.textContent = actionableTotal === 0
            ? `Your vault has no maintenance findings in this scan.${repeatedSummary}`
            : `${actionableTotal} ${actionableTotal === 1 ? 'finding' : 'findings'} to review.${repeatedSummary}`;
        summary.dataset.kind = actionableTotal === 0 ? 'clear' : 'findings';
        summary.classList.toggle('ui-notice--success', actionableTotal === 0);
        summary.classList.toggle('ui-notice--warning', actionableTotal > 0);
        summary.classList.remove('ui-notice--danger');
        results.innerHTML = healthSections.map(section => renderHealthSection(section, report[section.key])).join('');
    } catch (error) {
        if (!panel.isConnected) return;
        log.error('Vault health scan failed:', error);
        summary.textContent = 'The vault scan could not be completed.';
        summary.dataset.kind = 'error';
        summary.classList.remove('ui-notice--success', 'ui-notice--warning');
        summary.classList.add('ui-notice--danger');
        results.innerHTML = '<div class="vault-health-error">Try the scan again. No note was changed.</div>';
    } finally {
        if (panel.isConnected && button) {
            button.disabled = false;
            button.textContent = 'Run scan';
        }
    }
}

function renderHealthSection(section, issues) {
    const actionable = issues.length > 0 && !section.informational;
    const items = issues.length
        ? `<div class="vault-health-issues">${issues.map(issue => renderHealthIssue(issue, section.key)).join('')}</div>`
        : `<p class="vault-health-empty">${escapeHtml(section.empty)}</p>`;
    return `
        <section class="vault-health-section ${actionable ? 'has-findings' : ''}">
            <div class="vault-health-section-heading">
                <h3>${escapeHtml(section.title)}</h3>
                <span class="ui-badge ${actionable ? 'ui-badge--warning' : 'ui-badge--muted'}">${issues.length}</span>
            </div>
            ${items}
        </section>`;
}

function renderHealthIssue(issue, sectionKey) {
    const path = String(issue.path || '');
    const line = Number.isInteger(issue.line_num) && issue.line_num > 0 ? issue.line_num : null;
    const title = line ? `${path}:${line}` : path;
    const paths = Array.isArray(issue.paths) && issue.paths.length > 1
        ? `<span class="vault-health-paths">${issue.paths.map(escapeHtml).join('<br>')}</span>`
        : '';
    const target = issue.target ? `<span class="vault-health-target">Target: ${escapeHtml(issue.target)}</span>` : '';
    const reviewPaths = sectionKey === 'similar_notes' && Array.isArray(issue.paths)
        ? ` data-paths="${escapeAttribute(JSON.stringify(issue.paths))}"`
        : '';
    return `
        <article class="vault-health-issue">
            <button type="button" class="vault-health-open" data-path="${escapeAttribute(path)}" data-line="${line || ''}"${reviewPaths}>
                <span class="vault-health-issue-path">${escapeHtml(title)}</span>
                <span class="vault-health-issue-detail">${escapeHtml(issue.detail || 'Review this finding.')}</span>
                ${target}
                ${paths}
            </button>
        </article>`;
}

function openHealthIssue(button) {
    if (button.dataset.paths) {
        let paths;
        try {
            paths = JSON.parse(button.dataset.paths);
        } catch {
            paths = [];
        }
        if (Array.isArray(paths) && paths.length > 0) {
            for (const candidate of paths) {
                const path = String(candidate || '');
                if (path) openTab(path, path.split('/').pop(), 'file', { path, line: null });
            }
            return;
        }
    }
    const path = button.dataset.path;
    if (!path) return;
    const line = Number.parseInt(button.dataset.line || '', 10);
    openTab(path, path.split('/').pop(), 'file', { path, line: Number.isFinite(line) ? line : null });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#039;');
}

function escapeAttribute(value) {
    return escapeHtml(value).replaceAll('`', '&#096;');
}
