/**
 * Stand-in for the `server-only` package under Vitest.
 *
 * The real package throws when it is resolved through the browser condition,
 * which the jsdom test environment always uses. Aliasing it here lets unit
 * tests import server modules directly. The guard it provides in a real build
 * is unaffected: Next.js still resolves the genuine package.
 */
export {};
