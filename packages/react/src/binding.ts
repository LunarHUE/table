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
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTransition } from "#lunarhue/react";

// Connects a reusable `StateAdapter` (from `@lunarhue/table-core`) to React:
// stabilizes parsed state across fresh `input` objects, applies optimistic
// updates during async transitions (such as Next.js `router.replace`),
// composes multiple table commands in one event handler, and returns a
// `FeatureBindings` map ready for `useTable(def, { bind })`.

/** `useLayoutEffect` in the browser and `useEffect` on the server, where React before 18 warns about layout effects. */
const useCommitEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

type ExtraOption<TExtra> = [TExtra] extends [void]
  ? { readonly extra?: never }
  : [unknown] extends [TExtra]
    ? { readonly extra?: TExtra }
    : undefined extends TExtra
      ? { readonly extra?: TExtra }
      : { readonly extra: TExtra };

/** What `useTableBinding` takes besides the table definition and state adapter. */
export type UseTableBindingOptions<TInput, TExtra, TOutput> = {
  /** External source to parse, such as `Object.fromEntries(searchParams)`. */
  readonly input: TInput;
  /** Called once per atomic table update with the value `adapter.serialize` produced. */
  onWrite(this: void, output: TOutput): void;
  /**
   * Wraps `onWrite` in `startTransition` and holds the next state
   * optimistically until `input` updates or the transition ends. Defaults
   * to `true`.
   */
  readonly transition?: boolean;
} & ExtraOption<TExtra>;

/** What `useTableBinding` returns. */
export interface TableBindingResult<TDef extends AnyTableDef> {
  /** Pass to `useTable(def, { bind })`, or spread alongside other feature bindings. */
  readonly bind: FeatureBindings<StateOf<TDef> & object>;
  /** True while a transition started by `onWrite` is pending. */
  readonly isPending: boolean;
}

type Values = Readonly<Record<string, unknown>>;
type PendingState = { readonly baseKey: string; readonly state: Values } | null;

/** Picks `keys` out of `source` into a frozen object. */
const pick = (source: Values, keys: readonly string[]): Values => {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = source[key];
  return Object.freeze(out);
};

/** Reuses per-feature references from `prev` whenever their serialized values match. */
const stabilize = (prev: Values, next: Values, keys: readonly string[]): Values => {
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
 * Holds the latest committed binding context and handles `onStateChange`
 * writes. Created once per component in `useState` and synchronized only in
 * commit effects, so render stays pure under the React Compiler.
 */
class BindingController<TOutput> {
  private state: Values;
  private baseKey: string;
  private defaults: Values;
  private onWrite: (output: TOutput) => void;
  private serialize: (state: Values, defaults: Values) => TOutput;
  private transition: boolean;
  private startTransition: (fn: () => void) => void;
  private readonly setPending: (next: PendingState) => void;

  constructor(
    state: Values,
    baseKey: string,
    defaults: Values,
    onWrite: (output: TOutput) => void,
    serialize: (state: Values, defaults: Values) => TOutput,
    transition: boolean,
    startTransition: (fn: () => void) => void,
    setPending: (next: PendingState) => void,
  ) {
    this.state = state;
    this.baseKey = baseKey;
    this.defaults = defaults;
    this.onWrite = onWrite;
    this.serialize = serialize;
    this.transition = transition;
    this.startTransition = startTransition;
    this.setPending = setPending;
  }

  sync(
    state: Values,
    baseKey: string,
    defaults: Values,
    onWrite: (output: TOutput) => void,
    serialize: (state: Values, defaults: Values) => TOutput,
    transition: boolean,
    startTransition: (fn: () => void) => void,
  ): void {
    this.state = state;
    this.baseKey = baseKey;
    this.defaults = defaults;
    this.onWrite = onWrite;
    this.serialize = serialize;
    this.transition = transition;
    this.startTransition = startTransition;
  }

  readonly onStateChange = (updater: (prev: Values) => Values): void => {
    const next = updater(this.state);
    if (next === this.state) return;
    // Update synchronously so multiple commands in one handler compose cleanly.
    this.state = next;
    if (this.transition) this.setPending({ baseKey: this.baseKey, state: next });
    const output = this.serialize(next, this.defaults);
    if (this.transition) this.startTransition(() => this.onWrite(output));
    else this.onWrite(output);
  };
}

/**
 * Binds the features an adapter manages (intersected with the stateful
 * features installed on `def`) to an external React source such as Next.js
 * `useSearchParams` + `useRouter`, TanStack Router, or native `nuqs`.
 */
export function useTableBinding<
  TDef extends AnyTableDef,
  const TFeatures extends readonly string[],
  TInput,
  TOutput,
  TExtra = undefined,
  TCustom extends Readonly<Record<string, unknown>> = NoCustomFeatures,
>(
  def: TDef,
  adapter: StateAdapter<TFeatures, TInput, TOutput, TExtra, TCustom>,
  options: UseTableBindingOptions<TInput, TExtra, TOutput>,
): TableBindingResult<TDef> {
  const { input, onWrite } = options;
  const transition = options.transition ?? true;
  const extra = "extra" in options ? options.extra : undefined;

  const activeFeatures = useMemo(
    () => adapter.features.filter((name) => def.resolvedFeatures.byName.get(name)?.def.state !== undefined),
    [def, adapter.features],
  );
  const defaults = useMemo(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    () => pick(resolveTableState(def).state as Values, activeFeatures),
    [def, activeFeatures],
  );

  // Erased call so optional vs required `extra` spreads without per-branch duplication.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const resolved = (adapter.resolve as unknown as (d: TDef, i: TInput, e: unknown) => { readonly state: Values })(def, input, extra);
  const rawPicked = pick(resolved.state, activeFeatures);
  const rawKey = stableStringify(rawPicked);

  const [committed, setCommitted] = useState(() => ({ key: rawKey, state: rawPicked }));
  let currentCommitted = committed;
  if (committed.key !== rawKey) {
    currentCommitted = { key: rawKey, state: stabilize(committed.state, rawPicked, activeFeatures) };
    setCommitted(currentCommitted);
  }

  const [isPending, startTransition] = useTransition();
  const [pending, setPending] = useState<PendingState>(null);
  const [wasPending, setWasPending] = useState(false);

  let currentPending = pending;
  if (isPending !== wasPending) {
    setWasPending(isPending);
    if (!isPending && currentPending !== null) {
      currentPending = null;
      setPending(null);
    }
  }
  if (currentPending !== null && currentPending.baseKey !== currentCommitted.key) {
    currentPending = null;
    setPending(null);
  }

  const activeState = currentPending !== null && currentPending.baseKey === currentCommitted.key ? currentPending.state : currentCommitted.state;
  // `next` and `defaults` hold the adapter's active features.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const serialize = adapter.serialize as (s: Values, d: Values) => TOutput;

  const [controller] = useState(
    () => new BindingController(activeState, currentCommitted.key, defaults, onWrite, serialize, transition, startTransition, setPending),
  );
  useCommitEffect(() => {
    controller.sync(activeState, currentCommitted.key, defaults, onWrite, serialize, transition, startTransition);
  }, [controller, activeState, currentCommitted.key, defaults, onWrite, serialize, transition, startTransition]);

  const bind = useMemo(
    // `activeFeatures` is a subset of `def`'s stateful features, matching `FeatureBindings<StateOf<TDef>>`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    () => bindGroup(activeFeatures, { state: activeState, onStateChange: controller.onStateChange }) as FeatureBindings<StateOf<TDef> & object>,
    [activeFeatures, activeState, controller],
  );

  return useMemo(() => ({ bind, isPending }), [bind, isPending]);
}
