import { defineConfig } from "vitest/config";

/**
 * Vitest for apps/web — the unit half of the suite. `pnpm test` at the root
 * picks it up through `pnpm -r --if-present test`, so CI runs it without
 * ci.yml needing to name it.
 *
 * `tsconfigPaths` reads the `@/*` alias out of tsconfig.json instead of
 * repeating it here, so a path that resolves in the editor resolves in a test.
 *
 * jsdom rather than node even for the pure modules: lib/api/client.ts reaches
 * next-auth/react by way of authHeader(), and lib/format.ts formats through
 * Intl — both want a browser-shaped global.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
