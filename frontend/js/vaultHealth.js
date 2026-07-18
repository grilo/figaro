import { backend } from './backend.js';
import { log } from './log.js';
import { openTab } from './tabManager.js';

const healthSections = [
    { key: 'broken_links', title: 'Broken links', empty: 'All vault-local links resolve.' },
    { key: 'orphan_attachments', title: 'Orphan attachments', empty: 'Every tracked attachment is referenced.' },
    { key: 'duplicate_names', title: 'Duplicate filenames', empty: 'No duplicate filenames found.' },
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
                <button type="button" class="vault-health-scan">Run scan</button>
            </header>
            <div class="vault-health-summary" aria-live="polite"></div>
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
        const total = healthSections.reduce((count, section) => count + report[section.key].length, 0);
        summary.textContent = total === 0
            ? 'Your vault has no findings in this scan.'
            : `${total} ${total === 1 ? 'finding' : 'findings'} to review.`;
        summary.dataset.kind = total === 0 ? 'clear' : 'findings';
        results.innerHTML = healthSections.map(section => renderHealthSection(section, report[section.key])).join('');
    } catch (error) {
        if (!panel.isConnected) return;
        log.error('Vault health scan failed:', error);
        summary.textContent = 'The vault scan could not be completed.';
        summary.dataset.kind = 'error';
        results.innerHTML = '<div class="vault-health-error">Try the scan again. No note was changed.</div>';
    } finally {
        if (panel.isConnected && button) {
            button.disabled = false;
            button.textContent = 'Run scan';
        }
    }
}

function renderHealthSection(section, issues) {
    const items = issues.length
        ? `<div class="vault-health-issues">${issues.map(issue => renderHealthIssue(issue)).join('')}</div>`
        : `<p class="vault-health-empty">${escapeHtml(section.empty)}</p>`;
    return `
        <section class="vault-health-section ${issues.length ? 'has-findings' : ''}">
            <div class="vault-health-section-heading">
                <h3>${escapeHtml(section.title)}</h3>
                <span>${issues.length}</span>
            </div>
            ${items}
        </section>`;
}

function renderHealthIssue(issue) {
    const path = String(issue.path || '');
    const line = Number.isInteger(issue.line_num) && issue.line_num > 0 ? issue.line_num : null;
    const title = line ? `${path}:${line}` : path;
    const paths = Array.isArray(issue.paths) && issue.paths.length > 1
        ? `<span class="vault-health-paths">${issue.paths.map(escapeHtml).join('<br>')}</span>`
        : '';
    const target = issue.target ? `<span class="vault-health-target">Target: ${escapeHtml(issue.target)}</span>` : '';
    return `
        <article class="vault-health-issue">
            <button type="button" class="vault-health-open" data-path="${escapeAttribute(path)}" data-line="${line || ''}">
                <span class="vault-health-issue-path">${escapeHtml(title)}</span>
                <span class="vault-health-issue-detail">${escapeHtml(issue.detail || 'Review this finding.')}</span>
                ${target}
                ${paths}
            </button>
        </article>`;
}

function openHealthIssue(button) {
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
