import { useSyncExternalStore } from "react";

// The address bar as a store. Views read the query string and the hash
// through it, and every change goes through `navigate` or the browser's own
// back, forward and hash links, so React hears about all of them.

const subscribe = (listener: () => void): (() => void) => {
  window.addEventListener("popstate", listener);
  window.addEventListener("hashchange", listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("hashchange", listener);
  };
};

const readSearch = (): string => window.location.search;
const readHash = (): string => window.location.hash;

/** The query string, with its `?`, or `""`. */
export const useSearch = (): string => useSyncExternalStore(subscribe, readSearch);

/** The hash, with its `#`, or `""`. */
export const useHash = (): string => useSyncExternalStore(subscribe, readHash);

/**
 * Pushes a history entry. `pushState` fires no event of its own, so this
 * sends a `popstate` for the subscribers above.
 */
export function navigate(url: string): void {
  window.history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
