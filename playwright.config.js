import { defineConfig } from '@playwright/test';

const port = Number.parseInt(process.env.FIGARO_PLAYWRIGHT_PORT || '34115', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('FIGARO_PLAYWRIGHT_PORT must be a port from 1 to 65535');
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 45000,
    fullyParallel: false,
    use: {
        baseURL,
        browserName: 'chromium',
        headless: true,
    },
    webServer: {
        command: 'go run ./cmd/devserver',
        env: { ...process.env, FIGARO_DEVSERVER_PORT: String(port) },
        url: baseURL,
        timeout: 30000,
        reuseExistingServer: !process.env.CI,
    },
});
