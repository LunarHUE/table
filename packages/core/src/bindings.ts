import { createCell, createCells, type Cell, type Cells } from "./cells.js";
import { problem } from "./problem.js";

/** A new value, or a function from the current value to the new one. */
export type StateUpdater<T> = T | ((prev: T) => T);

/**
 * Feature state kept in a store the app owns: Zustand, a Solid signal, local
 * storage, anything with get, set and subscribe. `get` must return the new
 * value as soon as `set` returns.
 */
export interface ExternalBinding<T> {
  readonly kind?: "external";
  /** Returns the value now. */
  readonly get: () => T;
  /** Returns the value a server render shows. Defaults to `get`. */
  readonly getServerSnapshot?: () => T;
  /** Takes the next value. The table calls it only when the value changes. */
  readonly set: (next: T) => void;
  /** Calls `listener` when the value may have changed. Returns the function that unsubscribes. */
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * Feature state a framework component owns, as React's `value` and `onChange`
 * props do. `onStateChange` always gets a function of the previous value, so
 * two commands in one event handler both land, as two `setState(prev => ...)`
 * calls do.
 */
export interface ControlledBinding<T> {
  readonly kind: "controlled";
  readonly state: T;
  readonly onStateChange: (updater: (prev: T) => T) => void;
}

/** How one feature's state is owned outside the table. A feature with no binding lives in the table. */
export type FeatureBinding<T> = ExternalBinding<T> | ControlledBinding<T>;

/**
 * Several features in one external store, such as the URL. Pass the same
 * object for each feature it owns (or build it with `bindGroup`). A patch
 * that changes several of them calls `set` once, with all of them.
 */
export interface ExternalGroupBinding<TState extends object> {
  readonly kind: "group";
  get(this: void): TState;
  getServerSnapshot?(this: void): TState;
  /** Takes every feature in the group, changed or not. */
  set(this: void, next: TState): void;
  subscribe(this: void, listener: () => void): () => void;
}

/** Several features one component owns, changed together through one `onStateChange` call. */
export interface ControlledGroupBinding<TState extends object> {
  readonly kind: "controlled-group";
  readonly state: TState;
  onStateChange(this: void, updater: (prev: TState) => TState): void;
}

/** One owner for several features. */
export type GroupBinding<TState extends object> = ExternalGroupBinding<TState> | ControlledGroupBinding<TState>;

/** Input to `bindGroup` for a controlled group binding. */
export interface ControlledGroupInput<TState extends object> {
  readonly state: TState;
  onStateChange(this: void, updater: (prev: TState) => TState): void;
}

/** Input to `bindGroup` for an external group binding. */
export interface ExternalGroupInput<TState extends object> {
  get(this: void): TState;
  getServerSnapshot?(this: void): TState;
  set(this: void, next: TState): void;
  subscribe(this: void, listener: () => void): () => void;
}

/**
 * Binds several features to one shared owner (controlled or external),
 * returning a `FeatureBindings` map you can pass directly to `bind` or
 * spread alongside other owners.
 */
export function bindGroup<const TKeys extends readonly (keyof TState & string)[], TState extends object>(
  features: TKeys,
  binding: ControlledGroupInput<TState>,
): { readonly [K in TKeys[number]]: ControlledGroupBinding<TState> };
export function bindGroup<const TKeys extends readonly (keyof TState & string)[], TState extends object>(
  features: TKeys,
  binding: ExternalGroupInput<TState>,
): { readonly [K in TKeys[number]]: ExternalGroupBinding<TState> };
export function bindGroup<const TKeys extends readonly string[], TState extends object>(
  features: TKeys,
  binding: ControlledGroupInput<TState> | ExternalGroupInput<TState>,
): Readonly<Record<string, GroupBinding<TState>>> {
  const group: GroupBinding<TState> =
    "onStateChange" in binding
      ? { kind: "controlled-group", state: binding.state, onStateChange: binding.onStateChange }
      : {
          kind: "group",
          get: binding.get,
          ...(binding.getServerSnapshot ? { getServerSnapshot: binding.getServerSnapshot } : {}),
          set: binding.set,
          subscribe: binding.subscribe,
        };
  const out: Record<string, GroupBinding<TState>> = {};
  for (const name of features) out[name] = group;
  return out;
}

/**
 * The owner of each feature's state that the table doesn't keep. A group
 * binding appears under each feature it owns, and its value has at least
 * those features.
 */
export type FeatureBindings<TState extends object> = {
  readonly [K in keyof TState]?: FeatureBinding<TState[K]> | GroupBinding<{ readonly [P in K]: TState[P] }>;
};

/** Changes to some features' state, applied together. */
export type StatePatch<TState extends object> = { readonly [K in keyof TState]?: StateUpdater<TState[K]> };

/** What `createStateCoordinator` takes. */
export interface CoordinatorOptions<TState extends object> {
  /** Every feature's starting value. Features with a binding read their owner instead. */
  readonly initial: TState;
  readonly bindings?: FeatureBindings<TState>;
  /** The cells to keep feature snapshots in, so the coordinator shares batches with the rest of a table. */
  readonly cells?: Cells;
}

/** A table's state, feature by feature, whoever owns each one. */
export interface StateCoordinator<TState extends object> {
  readonly getSnapshot: <K extends keyof TState>(feature: K) => TState[K];
  readonly getServerSnapshot: <K extends keyof TState>(feature: K) => TState[K];
  /**
   * Calls `listener` when the feature changes. The first listener subscribes
   * to the external owners and the last one to leave unsubscribes from them.
   */
  readonly subscribe: (feature: keyof TState, listener: () => void) => () => void;
  /**
   * Applies changes to several features at once. Table features change in one
   * batch, and each owner hears once, however many of its features changed.
   */
  readonly applyPatch: (patch: StatePatch<TState>) => void;
  /**
   * Takes the bindings from a new render, for the controlled features. It
   * wakes no listeners, so it is safe to call during render. Call `flush`
   * once the render commits.
   */
  readonly updateControlled: (bindings: FeatureBindings<TState>) => void;
  readonly flush: () => void;
  readonly batch: <T>(fn: () => T) => T;
}

type Values = Readonly<Record<PropertyKey, unknown>>;
type Binding = FeatureBinding<unknown> | GroupBinding<Values>;
type Bindings = Readonly<Record<string, Binding | undefined>>;
type Entries = readonly (readonly [string, unknown])[];

/** The coordinator with slices named by string and values left unknown. */
interface Erased {
  readonly getSnapshot: (slice: string) => unknown;
  readonly getServerSnapshot: (slice: string) => unknown;
  readonly subscribe: (slice: string, listener: () => void) => () => void;
  readonly applyPatch: (patch: Readonly<Record<string, unknown>>) => void;
  readonly updateControlled: (bindings: Bindings) => void;
  readonly flush: () => void;
  readonly batch: <T>(fn: () => T) => T;
}

interface Owner {
  binding: Binding;
  readonly keys: string[];
  /** Unsubscribes from an external owner while the coordinator has listeners. */
  off: (() => void) | undefined;
}

const controlled = (binding: Binding) => binding.kind === "controlled" || binding.kind === "controlled-group";
const grouped = (binding: Binding) => binding.kind === "group" || binding.kind === "controlled-group";

const resolve = (updater: unknown, prev: unknown): unknown =>
  // A slice whose value is itself a function can't be set with a plain value, as with React's setState.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  typeof updater === "function" ? (updater as (prev: unknown) => unknown)(prev) : updater;

/** Applies `entries` to a group's value. Returns `prev` itself when nothing changed. */
const merge = (prev: Values, entries: Entries): Values => {
  let next: Record<PropertyKey, unknown> | undefined;
  for (const [key, updater] of entries) {
    const value = resolve(updater, prev[key]);
    if (!Object.is(value, prev[key])) (next ??= { ...prev })[key] = value;
  }
  return next ?? prev;
};

/**
 * Makes the coordinator for a table's state. It does nothing to the owners
 * until something subscribes or a patch arrives.
 */
export function createStateCoordinator<TState extends object>(
  options: CoordinatorOptions<TState>,
): StateCoordinator<TState> {
  // The work is the same for every slice, so it runs on erased types. The
  // public types keep each slice's value tied to its name.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return coordinate(options.initial as Values, (options.bindings ?? {}) as Bindings, options.cells) as unknown as StateCoordinator<TState>;
}

function coordinate(initial: Values, bindings: Bindings, shared: Cells | undefined): Erased {
  const [replace, listen, flush, batch] = shared ?? createCells();
  const slices = new Map<string, Cell<unknown>>();
  const owners = new Map<string, Owner>();
  const all: Owner[] = [];
  let listeners = 0;

  const groups = new Map<Binding, Owner>();
  for (const key of Object.keys(bindings)) {
    const binding = bindings[key];
    if (!binding) continue;
    let owner = grouped(binding) ? groups.get(binding) : undefined;
    if (!owner) {
      owner = { binding, keys: [], off: undefined };
      all.push(owner);
      if (grouped(binding)) groups.set(binding, owner);
    }
    owner.keys.push(key);
    owners.set(key, owner);
  }

  const cellOf = (key: string) => {
    let cell = slices.get(key);
    if (!cell) slices.set(key, (cell = createCell(initial[key])));
    return cell;
  };

  /** Copies the owner's current value into its slices' cells. */
  const pull = (owner: Owner) => {
    const { binding } = owner;
    let values: Values | undefined;
    let value: unknown;
    if (binding.kind === "group") values = binding.get();
    else if (binding.kind === "controlled-group") values = binding.state;
    else value = binding.kind === "controlled" ? binding.state : binding.get();
    for (const key of owner.keys) replace(cellOf(key), values ? values[key] : value);
  };

  const dispatch = (owner: Owner, entries: Entries) => {
    const { binding } = owner;
    const single = entries[0]?.[1];
    if (binding.kind === "controlled") {
      binding.onStateChange((prev) => resolve(single, prev));
      return;
    }
    if (binding.kind === "controlled-group") {
      binding.onStateChange((prev) => merge(prev, entries));
      return;
    }
    if (binding.kind === "group") {
      const prev = binding.get();
      const next = merge(prev, entries);
      if (next !== prev) binding.set(next);
    } else {
      const prev = binding.get();
      const next = resolve(single, prev);
      if (!Object.is(next, prev)) binding.set(next);
    }
    pull(owner);
  };

  const attach = () => {
    for (const owner of all) {
      pull(owner);
      const { binding } = owner;
      if (binding.kind !== "controlled" && binding.kind !== "controlled-group") {
        owner.off = binding.subscribe(() => batch(() => pull(owner)));
      }
    }
  };

  const detach = () => {
    for (const owner of all) {
      const off = owner.off;
      owner.off = undefined;
      off?.();
    }
  };

  return {
    getSnapshot: (slice) => {
      const owner = owners.get(slice);
      // An external owner nobody subscribes to may have changed unseen, and
      // a controlled one is only a reference, so both are read again.
      if (owner && !owner.off) pull(owner);
      return cellOf(slice).snapshot;
    },
    getServerSnapshot: (slice) => {
      const binding = owners.get(slice)?.binding;
      if (!binding) return initial[slice];
      if (binding.kind === "controlled") return binding.state;
      if (binding.kind === "controlled-group") return binding.state[slice];
      if (binding.kind === "group") return (binding.getServerSnapshot ?? binding.get)()[slice];
      return (binding.getServerSnapshot ?? binding.get)();
    },
    subscribe: (slice, listener) => {
      if (listeners++ === 0) attach();
      const unlisten = listen(cellOf(slice), listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        unlisten();
        if (--listeners === 0) detach();
      };
    },
    applyPatch: (patch) =>
      batch(() => {
        const work = new Map<Owner, (readonly [string, unknown])[]>();
        for (const key of Object.keys(patch)) {
          const updater = patch[key];
          const owner = owners.get(key);
          if (owner) {
            const entries = work.get(owner);
            if (entries) entries.push([key, updater]);
            else work.set(owner, [[key, updater]]);
          } else {
            const cell = cellOf(key);
            replace(cell, resolve(updater, cell.snapshot));
          }
        }
        for (const [owner, entries] of work) dispatch(owner, entries);
      }),
    updateControlled: (next) => {
      for (const key of Object.keys(next)) {
        const binding = next[key];
        const owner = owners.get(key);
        if (binding && controlled(binding) && !(owner && controlled(owner.binding))) {
          throw new Error(problem("bind:owner", key));
        }
      }
      for (const owner of all) {
        const { binding, keys } = owner;
        if (!controlled(binding)) continue;
        const replacement = next[keys[0] ?? ""];
        const moved = keys.find((key) => next[key] !== replacement);
        if (!replacement || replacement.kind !== binding.kind || moved !== undefined) {
          throw new Error(problem("bind:owner", moved ?? keys[0]));
        }
        owner.binding = replacement;
        pull(owner);
      }
    },
    flush,
    batch,
  };
}
