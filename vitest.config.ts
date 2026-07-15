import { defineConfig } from "vitest/config";

// Test runner for all three workspaces. Logic tests (game engine, step
// counting) run in the default node environment; component tests can opt into
// jsdom per-file with a `// @vitest-environment jsdom` comment.
export default defineConfig({
  test: {
    include: ["{frontend,backend,shared}/src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
