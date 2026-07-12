import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 45000,
    fullyParallel: false,
    use: {
        baseURL: 'http://127.0.0.1:34115',
        browserName: 'chromium',
        headless: true,
    },
    webServer: {
        command: 'go run ./cmd/devserver',
        url: 'http://127.0.0.1:34115',
        timeout: 30000,
        reuseExistingServer: !process.env.CI,
    },
});
