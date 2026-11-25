import type { ExternalBinding, ExternalGroupBinding } from "@lunarhue/table-core";
import { createEffect, createRoot, runWithOwner, untrack, type Accessor, type Setter } from "solid-js";

// The declarations bundle core's types, so a consumer's emitted declarations
// can name the types these functions return only through this entry.
export type { ExternalBinding, ExternalGroupBinding };

/**
 * Binds a table slice to a Solid 2 signal, given as the getter and setter
 * `createSignal` returns. A table write sets the signal. A change to the
 * signal reaches the table when Solid runs its effects. The effect that
 * watches the signal lives in a root of its own, made when the table gets
 * its first listener and disposed when it loses its last.
 */
export function signal<T>(get: Accessor<T>, set: Setter<T>): ExternalBinding<T> {
  return {
    get: () => untrack(get),
    // Table writes can come from inside a component or a computation, where
    // Solid throws on a signal write. The function form stores a value that
    // is itself a function as the value.
    set: (value) => runWithOwner(null, () => set(() => value)),
    // Detached from whatever owner the table gets its first listener under,
    // so only `dispose` ends the effect.
    subscribe: (listener) =>
      runWithOwner(null, () =>
        createRoot((dispose) => {
          // A table write comes back here too, after Solid flushes. The
          // table finds it already holds that value and wakes nothing.
          createEffect(get, () => listener());
          return dispose;
        }),
      ),
  };
}

/**
 * Binds several table slices to one Solid 2 signal holding all of them. A
 * table change that touches several slices sets the signal once. Pass the
 * result under each slice it owns:
 *
 * ```ts
 * const [query, setQuery] = createSignal({ filtering: {}, pagination: { pageIndex: 0, pageSize: 25 } });
 * const group = signalGroup(query, setQuery);
 * createTableStore(usersTable, { bind: { filtering: group, pagination: group } });
 * ```
 */
export function signalGroup<TSlices extends object>(get: Accessor<TSlices>, set: Setter<TSlices>): ExternalGroupBinding<TSlices> {
  return { ...signal(get, set), kind: "group" };
}
