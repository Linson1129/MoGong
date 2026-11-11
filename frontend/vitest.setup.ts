/**
 * Vitest global setup.
 *
 * Only the jest-dom matchers are registered. There is no per-test reset of the Zustand stores here,
 * because the stores are module singletons and a blanket reset would hide the fact that a test
 * depends on another one having run first -- each suite that needs a clean document calls
 * `resetDocument()` explicitly instead.
 */

import "@testing-library/jest-dom/vitest";
