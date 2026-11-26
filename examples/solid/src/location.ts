import { type Accessor, createSignal, onSettled } from "solid-js";

/** The address bar's query string and hash, as signals. */
export interface PageLocation {
  /** With its `?`, or `""`. */
  readonly search: Accessor<string>;
  /** With its `#`, or `""`. */
  readonly hash: Accessor<string>;
}

/**
 * Follows the address bar for the life of the component that calls it:
 * `navigate`, the browser's back and forward, and hash links.
 */
export function createLocation(): PageLocation {
  const [search, setSearch] = createSignal(window.location.search);
  const [hash, setHash] = createSignal(window.location.hash);
  const sync = (): void => {
    setSearch(window.location.search);
    setHash(window.location.hash);
  };
  onSettled(() => {
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  });
  return { search, hash };
}

/**
 * Pushes a history entry. `pushState` fires no event of its own, so this
 * sends a `popstate` for `createLocation`.
 */
export function navigate(url: string): void {
  window.history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
