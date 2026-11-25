import {
  bindGroup,
  resolveTableState,
  stableStringify,
  type AnyTableDef,
  type FeatureBindings,
  type NoCustomFeatures,
  type StateAdapter,
  type StateOf,
} from "@lunarhue/table-core";
import { runWithOwner, untrack, type Accessor } from "solid-js";
import { derived } from "./store.js";

// Connects a reusable `StateAdapter` (from `@lunarhue/table-core`) to Solid:
// derives normalized, reference-stable feature state from a reactive input
// accessor and returns `{ bind, state }` for `createTable(def, () => ({ bind: bind() }))`.

type ExtraOption<TExtra> = [TExtra] extends [void]
  ? { readonly extra?: never }
  : [unknown] extends [TExtra]
    ? { readonly extra?: TExtra | Accessor<TExtra> }
    : undefined extends TExtra
      ? { readonly extra?: TExtra | Accessor<TExtra> }
      : { readonly extra: TExtra | Accessor<TExtra> };

/** What `createTableBinding` takes besides the table definition and state adapter. */
export type CreateTableBindingOptions<TInput, TExtra, TOutput> = {
  /** Reactive accessor (or static value) of the external source to parse. */
  readonly input: TInput | Accessor<TInput>;
  /** Called once per atomic table update with the value `adapter.serialize` produced. */
  onWrite(this: void, output: TOutput): void;
} & ExtraOption<TExtra>;

/** What `createTableBinding` returns. */
export interface SolidTableBindingResult<TDef extends AnyTableDef> {
  /** Reactive bindings accessor for `createTable(def, () => ({ bind: bind() }))`. */
  readonly bind: Accessor<FeatureBindings<StateOf<TDef> & object>>;
  /** Resolved normalized table state accessor. */
  readonly state: Accessor<StateOf<TDef>>;
}

type Values = Readonly<Record<string, unknown>>;

const pick = (source: Values, keys: readonly string[]): Values => {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = source[key];
  return Object.freeze(out);
};

const stabilize = (prev: Values | undefined, next: Values, keys: readonly string[]): Values => {
  if (!prev) return next;
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.is(prev[key], next[key]) || stableStringify(prev[key]) === stableStringify(next[key])) {
      out[key] = prev[key];
    } else {
      out[key] = next[key];
      changed = true;
    }
  }
  return changed ? Object.freeze(out) : prev;
};

/**
 * Binds the features an adapter manages (intersected with the stateful
 * features installed on `def`) to a reactive Solid source such as router
 * search params. On the server it subscribes to nothing and resolves once.
 */
export function createTableBinding<
  TDef extends AnyTableDef,
  const TFeatures extends readonly string[],
  TInput,
  TOutput,
  TExtra = undefined,
  TCustom extends Readonly<Record<string, unknown>> = NoCustomFeatures,
>(
  def: TDef,
  adapter: StateAdapter<TFeatures, TInput, TOutput, TExtra, TCustom>,
  options: CreateTableBindingOptions<TInput, TExtra, TOutput>,
): SolidTableBindingResult<TDef> {
  const activeFeatures = adapter.features.filter((name) => def.resolvedFeatures.byName.get(name)?.def.state !== undefined);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const defaults = pick(resolveTableState(def).state as Values, activeFeatures);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const readInput: Accessor<TInput> = typeof options.input === "function" ? (options.input as Accessor<TInput>) : () => options.input as TInput;
  const rawExtra = "extra" in options ? options.extra : undefined;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const readExtra: Accessor<unknown> = typeof rawExtra === "function" ? (rawExtra as Accessor<unknown>) : () => rawExtra;

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const resolveErased = adapter.resolve as unknown as (d: TDef, i: TInput, e: unknown) => { readonly state: StateOf<TDef> };
  const fullState = derived(() => resolveErased(def, readInput(), readExtra()).state);

  let prevGroup: Values | undefined;
  let inBatch: Values | undefined;
  const groupState = derived(() => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const next = stabilize(prevGroup, pick(fullState() as Values, activeFeatures), activeFeatures);
    prevGroup = next;
    inBatch = undefined;
    return next;
  });

  const onStateChange = (updater: (prev: Values) => Values) => {
    const base = inBatch ?? untrack(groupState);
    const next = updater(base);
    if (next === base) return;
    inBatch = next;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const output = (adapter.serialize as (s: Values, d: Values) => TOutput)(next, defaults);
    // Table writes can come from inside a component or computation where Solid forbids owned writes.
    runWithOwner(null, () => options.onWrite(output));
    // Drop `inBatch` after the current tick so a rejected write never sticks.
    queueMicrotask(() => {
      if (inBatch === next) inBatch = undefined;
    });
  };

  const bind = derived(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    () => bindGroup(activeFeatures, { state: groupState(), onStateChange }) as FeatureBindings<StateOf<TDef> & object>,
  );

  return { bind, state: fullState };
}
