import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.AGB_TEST_PORT ?? 4111);

export default defineConfig({
  testDir: "./__tests__/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `node_modules/.bin/next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      AGB_DEV_FAKE_USER: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-anon-key",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      testIgnore: ["**/mobile-*.spec.ts"],
    },
    {
      // Mobile rendering via Chromium with iPhone viewport — avoids needing
      // webkit installed (saves ~200 MB disk).
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
      testMatch: ["**/mobile-*.spec.ts"],
    },
  ],
});
