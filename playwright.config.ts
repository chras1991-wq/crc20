import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    viewport: { width: 1280, height: 900 },
  },
});
