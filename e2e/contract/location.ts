import type { ProbeSource } from "./probe.js";

/** What the probe shows of a page's location. */
export interface LocationProbe {
  readonly search: string;
  /** History entries the page's links pushed. */
  readonly navigations: number;
  /** History entries the table's binding pushed through `onWrite`. */
  readonly writes: number;
}

/**
 * The query string as a store, for the pages bound to the URL. It reads
 * `window.location.search` in the browser and the request's query string on
 * the server, and wakes its listeners on `popstate` and on its own pushes.
 * Links push with `navigate` and a binding's `onWrite` with `write`, so a
 * spec can tell which of the two changed the URL.
 */
export interface PageLocation {
  read(this: void): string;
  subscribe(this: void, listener: () => void): () => void;
  /** Pushes `search` as a link would. */
  navigate(this: void, search: string): void;
  /** Pushes `search` for the table's binding. */
  write(this: void, search: string): void;
  /** The probe source for the location. */
  readonly probe: ProbeSource;
}

const inBrowser = (): boolean => typeof window !== "undefined";

export function createLocation(serverSearch: string): PageLocation {
  const listeners = new Set<() => void>();
  let navigations = 0;
  let writes = 0;
  const read = (): string => (inBrowser() ? window.location.search : serverSearch);
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const push = (search: string): void => {
    window.history.pushState(null, "", search === "" ? window.location.pathname : search);
    notify();
  };
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    window.addEventListener("popstate", listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("popstate", listener);
    };
  };
  return {
    read,
    subscribe,
    navigate(search) {
      navigations += 1;
      push(search);
    },
    write(search) {
      writes += 1;
      push(search);
    },
    probe: {
      get: (): LocationProbe => ({ search: read(), navigations, writes }),
      subscribe,
    },
  };
}
