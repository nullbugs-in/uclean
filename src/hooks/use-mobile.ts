import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Shadcn's stock version keeps a boolean in state and sets it from an effect,
 * which trips react-hooks/set-state-in-effect. Reading the media query as an
 * external store is the same behaviour without the extra render pass, and it is
 * server-safe: the server snapshot is the desktop layout, so the markup hydrates
 * identically and the client corrects on subscribe.
 */
function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
