import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["**/*.test.{ts,tsx}", "src/db/types.ts"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws by design when bundled for a client. Under Vitest
      // the jsdom environment resolves the browser entry, so alias it to a
      // no-op and let the test exercise the real module.
      "server-only": fileURLToPath(
        new URL("./vitest.server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
