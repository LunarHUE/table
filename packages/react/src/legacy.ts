import * as React from "react";
import { useEffect, useLayoutEffect, useReducer, useState } from "react";

// What `#lunarhue/react` resolves to under the `@lunarhue/react-legacy`
// condition, and the package's `./legacy` export: React's own hooks where it
// has them, and small fallbacks for React 16.8 and 17. Each choice is made
// once, here at load, so a component calls the same hooks on every render.

/** The hooks React 18 added, which React 16.8 and 17 lack. */
type Added = Partial<Pick<typeof React, "useId" | "useSyncExternalStore" | "useTransition">>;

const added: Added = React;

/**
 * Reads a hook React may lack. The name is a parameter, not a property
 * written in the source, so a bundler can't check it against React's exports
 * and fail the build on React 17.
 */
const optional = <K extends keyof Added>(name: K): Added[K] => added[name];

/** True when there is no DOM, as in server rendering. */
const onServer = typeof document === "undefined";

/** `useSyncExternalStore` as the adapter calls it. */
export type UseSyncExternalStore = <S>(
  subscribe: (onChange: () => void) => () => void,
  getSnapshot: () => S,
  getServerSnapshot?: () => S,
) => S;

/**
 * The snapshot a component last committed and the function that read it.
 * The fallback keeps one per component and changes it only in effects.
 */
class Committed<S> {
  constructor(
    private value: S,
    private read: () => S,
  ) {}

  /** Records what the latest render read. */
  record(value: S, read: () => S): void {
    this.value = value;
    this.read = read;
  }

  /** True when the store holds a different snapshot from the recorded one, or reading it throws. */
  stale(): boolean {
    try {
      return !Object.is(this.value, this.read());
    } catch {
      return true;
    }
  }
}

const bump = (count: number): number => count + 1;
const readSnapshot = <S>(getSnapshot: () => S, _tick: number): S => getSnapshot();

/**
 * The fallback on the client. It renders the current snapshot, then checks it
 * again in a layout effect, since a store write can land between render and
 * commit before the component subscribes. After that the subscription
 * re-renders it whenever the snapshot changes.
 */
function useStoreOnClient<S>(subscribe: (onChange: () => void) => () => void, getSnapshot: () => S): S {
  const [tick, rerender] = useReducer(bump, 0);
  // Depend on `tick` so React Compiler re-runs `getSnapshot()` on every `rerender()`.
  const value = readSnapshot(getSnapshot, tick);
  const [committed] = useState(() => new Committed(value, getSnapshot));
  useLayoutEffect(() => {
    committed.record(value, getSnapshot);
    if (committed.stale()) rerender();
  }, [committed, value, getSnapshot]);
  useEffect(() => {
    const check = () => {
      if (committed.stale()) rerender();
    };
    // A write between the layout effect and this one has no listener yet.
    check();
    return subscribe(check);
  }, [committed, subscribe]);
  return value;
}

/**
 * The fallback on the server. It reads the server snapshot once and uses no
 * effects, since React before 18 warns about `useLayoutEffect` there.
 */
const useStoreOnServer: UseSyncExternalStore = (_subscribe, getSnapshot, getServerSnapshot) =>
  (getServerSnapshot ?? getSnapshot)();

/** React's `useSyncExternalStore`, or a fallback with the same contract on React 16.8 and 17. */
export const useSyncExternalStore: UseSyncExternalStore =
  optional("useSyncExternalStore") ?? (onServer ? useStoreOnServer : useStoreOnClient);

let lastId = 0;
const newId = (): string => `:t${(lastId += 1).toString(36)}:`;

/** The fallback id: a count, kept for the life of the component. Server and client counts differ. */
const useCountedId = (): string => useState(newId)[0];

/** React's `useId`, or a counted id on React 16.8 and 17, which doesn't match between server and client. */
export const useId: () => string = optional("useId") ?? useCountedId;

const runSync = (fn: () => void): void => {
  fn();
};
const noTransition: readonly [boolean, (fn: () => void) => void] = Object.freeze([false, runSync]);
const useFallbackTransition = (): readonly [boolean, (fn: () => void) => void] => noTransition;

/** React's `useTransition`, or a synchronous fallback on React 16.8 and 17. */
export const useTransition: () => readonly [boolean, (fn: () => void) => void] =
  optional("useTransition") ?? useFallbackTransition;
