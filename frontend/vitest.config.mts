import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Named .mts rather than .ts because the file uses ESM syntax while package.json declares no
// `"type": "module"`, which Vite warns about as a future breaking change. The extension states the
// truth without changing how Next resolves every other file in the package.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    coverage: {
      // Only the pure layers. Covering the canvas would measure how well synthetic pointer events
      // exercise React, not whether the tool feels right, which is the thing that actually needs
      // checking and can only be checked by hand. See docs/dev-guide.md section 3.
      include: ["src/lib/**", "src/stores/**"],
      exclude: ["src/lib/constants.ts"],
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
