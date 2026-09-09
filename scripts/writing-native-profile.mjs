// Developer harness: one Go process hosts the production embedded engine.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

export async function openNativeWritingProfile() {
    const directory = mkdtempSync(join(tmpdir(), 'figaro-writing-profile-'));
    const executable = join(directory, process.platform === 'win32' ? 'writing-profile.exe' : 'writing-profile');
    try { execFileSync('go', ['build', '-o', executable, './cmd/writing-profile'], { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: ['ignore', 'ignore', 'inherit'] }); }
    catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
    const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    const pending = new Map();
    let readyResolve, readyReject, serial = 0;
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const exited = new Promise(resolve => child.once('close', resolve));
    const fail = error => { readyReject(error); for (const request of pending.values()) request.reject(error); pending.clear(); };
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.on('exit', () => fail(new Error('Native writing profile stopped')));
    createInterface({ input: child.stdout }).on('line', line => {
        let result;
        try { result = JSON.parse(line); } catch (error) { fail(error); return; }
        if (result.ready) { readyResolve(result.initializationMs); return; }
        const request = pending.get(result.id);
        if (!request) return;
        pending.delete(result.id);
        if (result.error) request.reject(new Error(result.error));
        else request.resolve(result.output);
    });
    let initializationMs;
    try { initializationMs = await ready; }
    catch (error) {
        child.kill();
        await exited;
        rmSync(directory, { recursive: true, force: true });
        throw error;
    }
    return {
        initializationMs,
        analyze(text) {
            const id = String(++serial);
            return new Promise((resolve, reject) => {
                pending.set(id, { resolve, reject });
                child.stdin.write(JSON.stringify({ id, text }) + '\n');
            });
        },
        async close() { child.stdin.end(); await exited; rmSync(directory, { recursive: true, force: true }); },
    };
}
