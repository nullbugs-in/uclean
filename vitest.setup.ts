import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/*
 * jsdom does not implement ResizeObserver, and Radix primitives - the dialog
 * behind the command palette among them - construct one on mount. Without this
 * any component that opens a Radix popover or dialog fails the test with
 * "ResizeObserver is not defined" before a single assertion runs.
 *
 * A no-op is enough: nothing under test measures anything, it only needs the
 * constructor to exist so the component can finish mounting.
 */
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/*
 * Likewise `scrollIntoView`, which cmdk and any list with a selected item calls
 * when it mounts. Guarding for it inside components means every call site
 * repeats a check that jsdom makes necessary but no browser does; stubbing it
 * once here keeps production code free of test-only branches.
 */
if (typeof Element.prototype.scrollIntoView !== "function") {
  // Cast: TypeScript believes `scrollIntoView` exists on Element, so an `in`
  // check narrows the prototype to `never`. The point of the check is that
  // jsdom's runtime and TypeScript's lib.dom disagree, and only one can be right
  // at a time.
  (
    Element.prototype as unknown as { scrollIntoView: () => void }
  ).scrollIntoView = function scrollIntoView() {};
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
