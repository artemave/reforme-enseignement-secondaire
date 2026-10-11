import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: true,
  forbidOnly: true, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'system', testDir: './tests/system' },
    { name: 'ui-desktop', testDir: './tests/browser-ui', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'ui-mobile', testDir: './tests/browser-ui', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  // The shared test harness starts a private fixture server for each worker.
});
