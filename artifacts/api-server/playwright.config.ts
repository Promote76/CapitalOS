import { defineConfig } from "@playwright/test";

const browserOrigin = process.env.CAPITAL_OS_BROWSER_ORIGIN ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./src/browser",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: browserOrigin,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium",
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.CAPITAL_OS_BROWSER_ORIGIN
    ? undefined
    : [
        {
          command: "pnpm run build && PORT=18081 NODE_ENV=development CAPITAL_OS_ALLOWED_ORIGIN=http://127.0.0.1:4173 pnpm run start",
          cwd: ".",
          url: "http://127.0.0.1:18081/api",
          timeout: 120_000,
          reuseExistingServer: false,
        },
        {
          command: "PORT=4173 BASE_PATH=/ API_PROXY_TARGET=http://127.0.0.1:18081 pnpm run dev",
          cwd: "../capital-os",
          url: browserOrigin,
          timeout: 120_000,
          reuseExistingServer: false,
        },
      ],
});