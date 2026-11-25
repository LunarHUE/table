import { act, render, screen } from "@testing-library/react";
import * as React from "react";
import { useLayoutEffect } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// `legacy.ts` picks its hooks once, when it loads, from what React exports.
// React 19 has them all, so these tests load it again against a copy of
// React without `useSyncExternalStore` and `useId`, as React 16.8 and 17
// are, and against a page without `document`, as on the server.

type Legacy = typeof import("./legacy.js");

/** Calls of `useLayoutEffect` and `useEffect` made through the copy of React. */
const effectCalls = { layout: 0, passive: 0 };

interface LoadOptions {
  /** Leave out the hooks React 18 added. */
  readonly old: boolean;
  /** Load with no `document`, as server rendering does. */
  readonly server?: boolean;
}

async function load<T>(path: string, { old, server = false }: LoadOptions): Promise<T> {
  vi.resetModules();
  vi.doMock("react", async () => {
    const actual = await vi.importActual<typeof React>("react");
    const counted = {
      ...actual,
      useLayoutEffect: (...args: Parameters<typeof actual.useLayoutEffect>) => {
        effectCalls.layout += 1;
        actual.useLayoutEffect(...args);
      },
      useEffect: (...args: Parameters<typeof actual.useEffect>) => {
        effectCalls.passive += 1;
        actual.useEffect(...args);
      },
    };
    return old ? { ...counted, useSyncExternalStore: undefined, useId: undefined } : counted;
  });
  if (server) vi.stubGlobal("document", undefined);
  try {
    // The path is a parameter, so each call loads a fresh copy after `resetModules`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return (await import(/* @vite-ignore */ path)) as T;
  } finally {
    vi.unstubAllGlobals();
    vi.doUnmock("react");
  }
}

afterEach(() => {
  effectCalls.layout = 0;
  effectCalls.passive = 0;
});

/** A store outside React, with its listeners and subscribe calls in view. */
function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const store = {
    subscribes: 0,
    listeners,
    get: () => value,
    /** Sets the value and wakes every listener, even when it didn't change. */
    set: (next: T) => {
      value = next;
      listeners.forEach((listener) => listener());
    },
    /** Sets the value without waking anyone, as a write before anyone subscribed. */
    sneak: (next: T) => {
      value = next;
    },
    subscribe: (listener: () => void) => {
      store.subscribes += 1;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return store;
}

type Store = ReturnType<typeof createStore<number>>;

/** The copy of `legacy.ts` the components below call. */
let lib: Legacy;
/** Each value `Reader` rendered, in order. */
let rendered: number[] = [];

interface ReaderProps {
  readonly store: Store;
}

function Reader({ store }: ReaderProps) {
  const value = lib.useSyncExternalStore(store.subscribe, store.get);
  rendered.push(value);
  return <output>{value}</output>;
}

interface WriterProps {
  readonly store: Store;
  readonly to: number;
}

/** Writes the store in a layout effect, before `Reader` subscribes in its passive effect. */
function Writer({ store, to }: WriterProps) {
  useLayoutEffect(() => {
    store.sneak(to);
  }, [store, to]);
  return null;
}

describe("legacy.ts on React 19", () => {
  it("hands over React's own hooks", async () => {
    const legacy = await load<Legacy>("./legacy.js", { old: false });
    const actual = await vi.importActual<typeof React>("react");
    expect(legacy.useSyncExternalStore).toBe(actual.useSyncExternalStore);
    expect(legacy.useId).toBe(actual.useId);
  });
});

describe("legacy.ts on React 16.8 and 17, in the browser", () => {
  it("falls back to its own hooks", async () => {
    lib = await load<Legacy>("./legacy.js", { old: true });
    expect(lib.useSyncExternalStore).not.toBe(React.useSyncExternalStore);
    expect(lib.useId).not.toBe(React.useId);
  });

  it("renders the snapshot, follows writes and skips equal ones", async () => {
    lib = await load<Legacy>("./legacy.js", { old: true });
    rendered = [];
    const store = createStore(1);
    const view = render(<Reader store={store} />);
    expect(screen.getByRole("status").textContent).toBe("1");
    expect(effectCalls.layout).toBeGreaterThan(0);
    expect(store.listeners.size).toBe(1);

    act(() => store.set(2));
    expect(screen.getByRole("status").textContent).toBe("2");

    const before = rendered.length;
    act(() => store.set(2));
    expect(rendered.length).toBe(before);

    view.unmount();
    expect(store.listeners.size).toBe(0);
    // StrictMode mounts twice; each subscribe was matched by its cleanup.
    expect(store.subscribes).toBeGreaterThan(0);
  });

  it("catches a write that lands before its layout effect", async () => {
    lib = await load<Legacy>("./legacy.js", { old: true });
    rendered = [];
    const store = createStore(1);
    // Effects run in tree order, so the writer's layout effect runs after the
    // reader rendered 1 and before the reader's own layout effect checks.
    // StrictMode would run every effect twice and hide a missed check.
    render(
      <>
        <Writer store={store} to={2} />
        <Reader store={store} />
      </>,
      { reactStrictMode: false },
    );
    expect(screen.getByRole("status").textContent).toBe("2");
    expect(rendered).toContain(1);
    expect(rendered[rendered.length - 1]).toBe(2);
  });

  it("catches a write between the layout effect and the subscription", async () => {
    lib = await load<Legacy>("./legacy.js", { old: true });
    rendered = [];
    const store = createStore(1);
    // Here the reader's layout effect has already checked when the writer
    // writes, and nothing listens yet. The passive effect checks once more.
    render(
      <>
        <Reader store={store} />
        <Writer store={store} to={3} />
      </>,
      { reactStrictMode: false },
    );
    expect(screen.getByRole("status").textContent).toBe("3");
    expect(rendered[rendered.length - 1]).toBe(3);
    act(() => store.set(4));
    expect(screen.getByRole("status").textContent).toBe("4");
  });

  it("follows a new getSnapshot without resubscribing", async () => {
    lib = await load<Legacy>("./legacy.js", { old: true });
    const a = createStore(1);
    const b = createStore(10);
    function Both({ pick }: { readonly pick: "a" | "b" }) {
      const value = lib.useSyncExternalStore(a.subscribe, pick === "a" ? a.get : b.get);
      return <output>{value}</output>;
    }
    const view = render(<Both pick="a" />);
    const subscribes = a.subscribes;
    view.rerender(<Both pick="b" />);
    expect(screen.getByRole("status").textContent).toBe("10");
    expect(a.subscribes).toBe(subscribes);
  });

  it("gives each component its own id, kept across renders", async () => {
    lib = await load<Legacy>("./legacy.js", { old: true });
    const seen: string[] = [];
    function Labelled({ tick }: { readonly tick: number }) {
      const id = lib.useId();
      seen.push(id);
      return <p id={id}>{tick}</p>;
    }
    const view = render(
      <>
        <Labelled tick={0} />
        <Labelled tick={0} />
      </>,
    );
    const first = [...document.querySelectorAll("p")].map((p) => p.id);
    expect(first[0]).toMatch(/^:t[0-9a-z]+:$/);
    expect(new Set(first).size).toBe(2);
    view.rerender(
      <>
        <Labelled tick={1} />
        <Labelled tick={1} />
      </>,
    );
    expect([...document.querySelectorAll("p")].map((p) => p.id)).toEqual(first);
  });
});

describe("legacy.ts on React 16.8 and 17, on the server", () => {
  it("reads the server snapshot and neither subscribes nor runs effects", async () => {
    lib = await load<Legacy>("./legacy.js", { old: true, server: true });
    const store = createStore(1);
    const getServer = vi.fn<() => number>(() => 99);
    function Server() {
      const value = lib.useSyncExternalStore(store.subscribe, store.get, getServer);
      return <output>{value}</output>;
    }
    const html = renderToString(<Server />);
    expect(html).toContain("99");
    expect(getServer).toHaveBeenCalled();
    expect(store.subscribes).toBe(0);
    expect(effectCalls.layout).toBe(0);
    expect(effectCalls.passive).toBe(0);
  });

  it("falls back to getSnapshot without a server snapshot", async () => {
    lib = await load<Legacy>("./legacy.js", { old: true, server: true });
    rendered = [];
    const store = createStore(7);
    expect(renderToString(<Reader store={store} />)).toContain("7");
    expect(store.subscribes).toBe(0);
  });

  it("gives counted ids that hydration can't match", async () => {
    lib = await load<Legacy>("./legacy.js", { old: true, server: true });
    function Labelled() {
      const id = lib.useId();
      return <p id={id} />;
    }
    expect(renderToString(<Labelled />)).toMatch(/id=":t[0-9a-z]+:"/);
  });
});

describe("react18.ts", () => {
  it("throws a pointer to the legacy condition on React 17", async () => {
    await expect(load("./react18.js", { old: true })).rejects.toThrow(/@lunarhue\/react-legacy/);
  });

  it("hands over React's hooks on React 18 and later", async () => {
    const mod = await load<typeof import("./react18.js")>("./react18.js", { old: false });
    const actual = await vi.importActual<typeof React>("react");
    expect(mod.useSyncExternalStore).toBe(actual.useSyncExternalStore);
    expect(mod.useId).toBe(actual.useId);
  });
});
