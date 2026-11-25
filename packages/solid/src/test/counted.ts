/**
 * A copy of `table` whose subscribe methods count their live subscriptions.
 * The store is frozen, so the copy wraps them instead of patching it.
 */
export function counted<T extends object>(table: T): { readonly table: T; readonly live: () => number } {
  let live = 0;
  const names = ["subscribeFeature", "subscribeKeyed", "subscribeColumns", "subscribeRequest", "subscribeState"];
  const copy: Record<string, unknown> = {};
  Object.assign(copy, table);
  for (const name of names) {
    const original = copy[name];
    if (typeof original !== "function") continue;
    copy[name] = (...args: unknown[]) => {
      live++;
      const off: unknown = Reflect.apply(original, undefined, args);
      let done = false;
      return () => {
        if (!done) live--;
        done = true;
        if (typeof off === "function") off();
      };
    };
  }
  // The copy has every member of `table`, with the subscribe methods wrapped.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { table: copy as T, live: () => live };
}
