import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The staged browser CPython (scripts/stage_wasm.py). Vendored, minified, regenerated on every
    // `make sites`, and already gitignored -- 5,400 findings for two files nobody here edits.
    "public/wasm/**",
  ]),
]);

export default eslintConfig;
