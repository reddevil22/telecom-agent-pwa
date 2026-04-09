import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: false,
    viewport: { width: 390, height: 844 },
    video: 'on',
    launchOptions: {
      slowMo: 150,
    },
  },
  projects: [
    {
      name: 'demo',
      testMatch: 'demo.spec.ts',
      use: {
        browserName: 'firefox',
        launchOptions: {
          executablePath: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
        },
        video: {
          mode: 'on',
          size: { width: 390, height: 844 },
        },
      },
    },
  ],
});
