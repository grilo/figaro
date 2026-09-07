import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const hook = path.resolve('.githooks/prepare-commit-msg');

describe('commit proposal handoff', () => {
    test('plain commits use each linked worktree proposal and preserve explicit messages', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figaro-handoff-'));
        const checkout = path.join(root, 'checkout');
        const linked = path.join(root, 'linked');
        fs.mkdirSync(checkout);
        const git = (cwd, ...args) => execFileSync('git', args, {
            cwd,
            encoding: 'utf8',
            env: { ...process.env, GIT_CONFIG_GLOBAL: path.join(root, 'no-global-config'), GIT_CONFIG_NOSYSTEM: '1', GIT_EDITOR: ':', FIGARO_COMMIT_TEMPLATE: '' },
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        const propose = (cwd, message) => {
            const proposal = path.resolve(cwd, git(cwd, 'rev-parse', '--git-path', 'COMMIT_TEMPLATE'));
            fs.writeFileSync(proposal, `${message}\n`);
            return proposal;
        };
        try {
            git(checkout, 'init', '--initial-branch=main');
            git(checkout, 'config', 'user.name', 'Handoff test');
            git(checkout, 'config', 'user.email', 'handoff@example.invalid');
            git(checkout, 'config', 'core.hooksPath', '.githooks');
            fs.mkdirSync(path.join(checkout, '.githooks'));
            fs.copyFileSync(hook, path.join(checkout, '.githooks/prepare-commit-msg'));
            fs.chmodSync(path.join(checkout, '.githooks/prepare-commit-msg'), 0o755);
            git(checkout, 'add', '.githooks');
            git(checkout, 'commit', '-m', 'Initial fixture');
            git(checkout, 'worktree', 'add', '-b', 'codex/handoff-test', linked);
            expect(fs.statSync(path.join(linked, '.git')).isFile()).toBe(true);
            const mainProposal = propose(checkout, 'Main checkout proposal');
            const linkedProposal = propose(linked, 'Linked worktree proposal');
            expect(linkedProposal).not.toBe(mainProposal);
            git(linked, 'commit', '--allow-empty');
            expect(git(linked, 'log', '-1', '--format=%B')).toBe('Linked worktree proposal');
            git(checkout, 'commit', '--allow-empty');
            expect(git(checkout, 'log', '-1', '--format=%B')).toBe('Main checkout proposal');
            git(linked, 'commit', '--allow-empty', '-m', 'Explicit message');
            expect(git(linked, 'log', '-1', '--format=%B')).toBe('Explicit message');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
