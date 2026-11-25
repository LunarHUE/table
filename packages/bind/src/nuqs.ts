import type { AnyTableDef, ControlledGroupBinding, FeatureBindings } from "@lunarhue/table-core";
import type { RawParam, TableUrl, UrlSchema, UrlStateOf } from "@lunarhue/table-core/url";
import { createMultiParser, debounce, throttle, useQueryStates, type Options } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState, type TransitionStartFunction } from "react";

// The declarations bundle core's types, so a consumer's emitted declarations
// can name the types useNuqsBinding returns only through this entry.
export type { AnyTableDef, ControlledGroupBinding, FeatureBindings, TableUrl, UrlSchema, UrlStateOf };

// nuqs holds each query key's raw values, and the table URL does all the
// reading and writing: `parse` turns the raw query into slices, with the
// table's defaults and each feature's `normalize`, and `serialize` turns
// slices back into a query, leaving defaults out. So no codec runs twice and
// no default lives in two places.

/** What `useNuqsBinding` takes. */
export interface NuqsBindingOptions {
  /** Goes before every query key, so several tables can share a page: `"users_"` reads `users_page`. */
  readonly prefix?: string;
  /** `false` lets a URL change reach the server, as for a server component that reads the query. nuqs defaults to `true`. */
  readonly shallow?: boolean;
  /** Whether a change adds a history entry. nuqs defaults to `"replace"`. */
  readonly history?: "push" | "replace";
  /**
   * Runs the navigation a URL change starts, such as the `startTransition`
   * from `useTransition`, to show that a server render is pending. The
   * table's state still changes at once, so a text input bound to a filter
   * never lags.
   */
  readonly startTransition?: TransitionStartFunction;
  /** The least time between URL updates, in ms. */
  readonly throttleMs?: number;
  /**
   * Waits this long after the last change before updating the URL, in ms.
   * Pass a record to wait only for some parameters, by query key without
   * the prefix or by slice name: `{ search: 300 }` or `{ filtering: 300 }`.
   * A change that touches a waiting parameter holds back the whole change,
   * so a new filter and the page reset it causes land in one URL update.
   */
  readonly debounceMs?: number | Readonly<Record<string, number>>;
  /** Leaves out values equal to their default. Defaults to `true`. */
  readonly clearOnDefault?: boolean;
}

/** What `useNuqsBinding` returns: one binding under every slice of the URL schema. */
export type NuqsBindings<TDef extends AnyTableDef, TSchema> = {
  readonly [K in keyof UrlStateOf<TDef, TSchema>]: ControlledGroupBinding<UrlStateOf<TDef, TSchema>>;
};

type RawValues = readonly string[] | null;
type RawState = Readonly<Record<string, RawValues>>;

/** Keeps a key's raw values as they are, for the table URL to read. */
const raw = createMultiParser<readonly string[]>({
  parse: (values) => values,
  serialize: (values) => [...values],
  eq: (a, b) => a.length === b.length && a.every((value, i) => value === b[i]),
});

const same = (a: RawValues, b: RawValues) => (a && b ? raw.eq(a, b) : a === b);

/** The raw state as the table URL reads it, without missing keys. */
const query = (state: RawState) => {
  const out: Record<string, RawParam> = {};
  for (const key of Object.keys(state)) {
    const values = state[key];
    if (values) out[key] = values;
  }
  return out;
};

/**
 * Keeps the slices of a table URL in the query string with nuqs. Every
 * slice shares one controlled binding, so a change to several of them, such
 * as a new filter and the page reset it causes, is one nuqs update, and two
 * table commands in one event handler both land.
 *
 * ```tsx
 * const [pending, startTransition] = useTransition();
 * const table = useTable(usersTable, { bind: useNuqsBinding(usersUrl, { shallow: false, startTransition }) });
 * ```
 *
 * Spread the result to keep other slices elsewhere:
 * `{ ...useNuqsBinding(usersUrl), visibility: storedVisibility }`.
 */
export function useNuqsBinding<TDef extends AnyTableDef, TSchema extends UrlSchema<TDef>>(
  tableUrl: TableUrl<TDef, TSchema>,
  options: NuqsBindingOptions = {},
): NuqsBindings<TDef, TSchema> {
  type State = UrlStateOf<TDef, TSchema>;
  const { prefix = "", shallow, history, startTransition, throttleMs, debounceMs, clearOnDefault = true } = options;
  // Stands for `debounceMs`, which may be a new record every render.
  const debounceKey = JSON.stringify(debounceMs);

  const params = useMemo(() => tableUrl.getParamDescriptors({ prefix }), [tableUrl, prefix]);
  // The wait for each query key that has one.
  const waits = useMemo(() => {
    const out: Record<string, number> = {};
    for (const param of params) {
      const ms = typeof debounceMs === "object" ? (debounceMs[param.key.slice(prefix.length)] ?? debounceMs[param.slice]) : debounceMs;
      if (ms) out[param.key] = ms;
    }
    return out;
  }, [params, prefix, debounceKey]);
  const keyMap = useMemo(() => Object.fromEntries(params.map((param) => [param.key, raw])), [params]);

  const [values, setValues] = useQueryStates(keyMap, {
    ...(history && { history }),
    ...(shallow === undefined ? {} : { shallow }),
    ...(startTransition && { startTransition }),
    ...(throttleMs === undefined ? {} : { limitUrlUpdates: throttle(throttleMs) }),
  });

  // Each slice's last value and the raw values it came from, so a slice
  // whose parameters didn't change keeps its object.
  const [cache] = useState(() => new Map<string, readonly [string, unknown]>());
  const state = useMemo(() => {
    const parsed: Readonly<Record<string, unknown>> = tableUrl.parse(query(values), { prefix }).state;
    const out: Record<string, unknown> = {};
    for (const slice of Object.keys(parsed)) {
      const key = JSON.stringify(params.filter((param) => param.slice === slice).map((param) => values[param.key]));
      const hit = cache.get(slice);
      if (hit?.[0] === key) out[slice] = hit[1];
      else cache.set(slice, [key, (out[slice] = parsed[slice])]);
    }
    // `parse` gave a value for every slice of the schema.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return out as State;
  }, [tableUrl, prefix, params, values, cache]);

  // A change that waits restarts nuqs's timer for every key, one timer per
  // key. Timers made a moment apart can fire on either side of nuqs's flush,
  // so this timer, made just before them with the same wait, fires first and
  // sends every key through nuqs's throttle queue at once. That cancels the
  // per-key timers, and the change lands in one URL update.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onStateChange = useCallback(
    (updater: (prev: State) => State) => {
      const call: Options = {};
      // nuqs hands the updater its latest values, which include changes it
      // hasn't written to the URL yet, so commands in one handler compose.
      void setValues((old) => {
        const prev = tableUrl.parse(query(old), { prefix }).state;
        const next = updater(prev);
        const patch: Record<string, RawValues> = {};
        if (next === prev) return patch;
        const written = tableUrl.serialize(next, { prefix, clearOnDefault });
        let wait = 0;
        for (const param of params) {
          const items = written.getAll(param.key);
          const value = items.length > 0 ? items : null;
          if (same(old[param.key] ?? null, value)) continue;
          patch[param.key] = value;
          wait = Math.max(wait, waits[param.key] ?? 0);
        }
        const waiting = timer.current !== undefined;
        clearTimeout(timer.current);
        timer.current = undefined;
        if (wait > 0) {
          timer.current = setTimeout(() => {
            timer.current = undefined;
            void setValues((latest) => latest);
          }, wait);
          // nuqs reads the call's options after it runs the updater.
          call.limitUrlUpdates = debounce(wait);
        }
        // Every key goes again, unchanged ones as the same arrays, so they
        // wait together, or go now with a change that doesn't wait.
        if (wait > 0 || waiting) {
          for (const param of params) if (!(param.key in patch)) patch[param.key] = old[param.key] ?? null;
        }
        return patch;
      }, call);
    },
    [tableUrl, prefix, params, waits, clearOnDefault, setValues],
  );

  const binding = useMemo((): ControlledGroupBinding<State> => ({ kind: "controlled-group", state, onStateChange }), [state, onStateChange]);
  return useMemo(() => {
    const out: Record<string, ControlledGroupBinding<State>> = {};
    for (const slice of Object.keys(tableUrl.defaults)) out[slice] = binding;
    // `defaults` has every slice of the schema.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return out as NuqsBindings<TDef, TSchema>;
  }, [tableUrl, binding]);
}
