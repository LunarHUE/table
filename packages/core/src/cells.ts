/** One listener on a cell. */
interface Subscription {
  readonly listener: () => void;
  /** The snapshot this listener last saw. It isn't called again until the snapshot differs. */
  seen: unknown;
  active: boolean;
}

/** Something listeners watch: a slice of table state, a row, a column or a cell. */
export interface Cell<S> {
  snapshot: S;
  /** The snapshot from before the first change since listeners last ran. Set only while the cell waits to wake them. */
  before: S | undefined;
  subscriptions: Set<Subscription> | undefined;
}

/**
 * The subscription code of one store, as a tuple so the names minify:
 * - `replace` gives a cell its new snapshot and queues its listeners. An
 *   equal snapshot, by `Object.is`, changes nothing.
 * - `listen` adds a listener to a cell and returns the function that removes it.
 * - `flush` runs the queued listeners, each once, unless a batch is open.
 *   It throws the first error a listener threw, after running the rest.
 * - `batch` runs `fn` and holds listeners until the outermost batch returns.
 */
export type Cells = readonly [
  replace: <S>(cell: Cell<S>, next: S) => void,
  listen: <S>(cell: Cell<S>, listener: () => void) => () => void,
  flush: () => void,
  batch: <T>(fn: () => T) => T,
];

/** Makes a cell with no listeners. */
export const createCell = <S>(snapshot: S): Cell<S> => ({ snapshot, before: undefined, subscriptions: undefined });

/** Makes the subscription code of one store: listeners per cell, each woken once per change. */
export function createCells(): Cells {
  let depth = 0;
  // Cells whose snapshot changed and whose listeners haven't run yet.
  const pending = new Set<Cell<unknown>>();

  const flush = () => {
    if (depth > 0 || pending.size === 0) return;
    const cells = [...pending];
    pending.clear();
    let failed = false;
    let error: unknown;
    for (const cell of cells) {
      cell.before = undefined;
      if (!cell.subscriptions) continue;
      // A Set skips entries deleted during the loop. One added during the loop
      // has already seen the current snapshot, so the check below skips it.
      for (const subscription of cell.subscriptions) {
        if (!subscription.active || Object.is(subscription.seen, cell.snapshot)) continue;
        subscription.seen = cell.snapshot;
        try {
          subscription.listener();
        } catch (caught) {
          if (!failed) {
            failed = true;
            error = caught;
          }
        }
      }
    }
    if (failed) throw error;
  };

  return [
    (cell, next) => {
      const previous = cell.snapshot;
      if (Object.is(next, previous)) return;
      cell.snapshot = next;
      if (cell.subscriptions && !pending.has(cell)) {
        cell.before = previous;
        pending.add(cell);
      }
    },
    (cell, listener) => {
      const subscription: Subscription = { listener, seen: cell.snapshot, active: true };
      (cell.subscriptions ??= new Set()).add(subscription);
      return () => {
        if (!subscription.active) return;
        subscription.active = false;
        cell.subscriptions?.delete(subscription);
        // The set and the pending entry only serve subscribers, so they go with the last one.
        if (cell.subscriptions?.size === 0) {
          cell.subscriptions = undefined;
          cell.before = undefined;
          pending.delete(cell);
        }
      };
    },
    flush,
    (fn) => {
      depth++;
      try {
        return fn();
      } finally {
        depth--;
        flush();
      }
    },
  ];
}

/**
 * What a keyed store is keyed by. A row store is keyed by row id, a column
 * store by column id, and a cell store by `cellKey(rowId, columnId)`.
 */
export type KeyedScope = "row" | "column" | "cell";

/**
 * Snapshots per key, for state read one row, column or cell at a time. A
 * key has a cell only while something listens to it, so a table with a
 * million rows holds cells for the rows on screen and no more.
 */
export interface KeyedStore<TKey, S> {
  /** The key's snapshot. A key nobody listens to is read fresh each time. */
  readonly get: (key: TKey) => S;
  /** Calls `listener` when the key's snapshot changes. Returns the function that unsubscribes. */
  readonly subscribe: (key: TKey, listener: () => void) => () => void;
  /** Reads the key again and wakes its listeners if the snapshot changed. */
  readonly notifyKey: (key: TKey) => void;
  /** `notifyKey` for each key, with the listeners woken together at the end. */
  readonly notifyKeys: (keys: Iterable<TKey>) => void;
  /** Reads every key that has listeners again. Listeners of unchanged keys stay asleep. */
  readonly notifyAll: () => void;
  /** How many keys have listeners, and so a cell. */
  readonly size: () => number;
}

/** The key of one cell in a cell-scoped store. A NUL byte can't appear in ids a user types. */
export const cellKey = (rowId: string, columnId: string): string => `${rowId}\0${columnId}`;

/**
 * Makes a keyed store on `cells`. `read` computes a key's snapshot from the
 * table's state. It should return an equal value (by `Object.is`) when
 * nothing about the key changed, so a primitive or a settled object.
 */
export function createKeyedCells<S, TKey = string>(cells: Cells, read: (key: TKey) => S): KeyedStore<TKey, S> {
  const [replace, listen, , batch] = cells;
  const map = new Map<TKey, Cell<S>>();

  const notifyKey = (key: TKey) => {
    const cell = map.get(key);
    if (cell) replace(cell, read(key));
  };

  return {
    get: (key) => {
      const cell = map.get(key);
      return cell ? cell.snapshot : read(key);
    },
    subscribe: (key, listener) => {
      let cell = map.get(key);
      if (!cell) map.set(key, (cell = createCell(read(key))));
      const owned = cell;
      const unlisten = listen(owned, listener);
      return () => {
        unlisten();
        if (!owned.subscriptions && map.get(key) === owned) map.delete(key);
      };
    },
    notifyKey: (key) => batch(() => notifyKey(key)),
    notifyKeys: (keys) =>
      batch(() => {
        for (const key of keys) notifyKey(key);
      }),
    notifyAll: () =>
      batch(() => {
        for (const key of map.keys()) notifyKey(key);
      }),
    size: () => map.size,
  };
}
