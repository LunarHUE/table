/** Anything else a page wants in its probe, such as the page's location. */
export interface ProbeSource {
  get(): unknown;
  subscribe(listener: () => void): () => void;
}

/** The part of a table store the probe reads. */
export interface ProbeTable {
  getState(): unknown;
  subscribeState(listener: () => void): () => void;
}

/** What the probe element holds, as JSON. */
export interface ProbeState {
  /** The table's whole state, every feature's slice by its name. */
  readonly state: Readonly<Record<string, unknown>>;
  /** What each extra source holds. */
  readonly sources: Readonly<Record<string, unknown>>;
}

type Sources = Readonly<Record<string, ProbeSource>>;

/** Reads the table's state and the sources. */
export function readProbe(table: ProbeTable, sources: Sources = {}): ProbeState {
  const state = table.getState();
  return {
    state: typeof state === "object" && state !== null ? { ...state } : {},
    sources: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, source.get()])),
  };
}

/**
 * Writes the table's state into `element` as JSON, now and after every
 * change, until the returned function is called. Every app starts it the
 * same way after hydration, so the probe is empty in the server HTML and
 * filled once the page is live.
 */
export function startProbe(element: Element, table: ProbeTable, sources: Sources = {}): () => void {
  let queued = false;
  const write = (): void => {
    queued = false;
    element.textContent = JSON.stringify(readProbe(table, sources), null, 2);
  };
  // One write can wake several listeners, so they share one rewrite.
  const schedule = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(write);
  };
  const stops = [table.subscribeState(schedule), ...Object.values(sources).map((source) => source.subscribe(schedule))];
  write();
  return () => {
    for (const stop of stops) stop();
  };
}
