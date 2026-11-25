// @vitest-environment jsdom
import { createTableStore, type TableStore } from "@lunarhue/table-core";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { withNuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usersTable, usersUrl } from "./fixtures/users.js";
import { useNuqsBinding, type NuqsBindingOptions } from "./nuqs.js";

afterEach(() => {
  cleanup();
});

/** A store bound to the URL, taking each render's bindings as `useTable` does. */
function useUsers(options?: NuqsBindingOptions): TableStore<typeof usersTable> {
  const bind = useNuqsBinding(usersUrl, options);
  const [store] = useState(() => createTableStore(usersTable, { bind }));
  store.updateOptions({ bind });
  useEffect(() => store.flush());
  return store;
}

/** Renders the store under the nuqs testing adapter, recording every URL update. */
function setup(searchParams = "", options?: NuqsBindingOptions) {
  const updates: UrlUpdateEvent[] = [];
  const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>((event) => {
    updates.push(event);
  });
  const view = renderHook(() => useUsers(options), {
    wrapper: withNuqsTestingAdapter({ searchParams, onUrlUpdate, hasMemory: true }),
  });
  const store = () => view.result.current;
  const query = () => updates[updates.length - 1]?.queryString;
  return { store, updates, query, onUrlUpdate };
}

describe("useNuqsBinding", () => {
  it("reads the URL into the table, with defaults for what it lacks", () => {
    const { store } = setup("?sort=-name&page=3&pageSize=25&role=admin");
    expect(store().getFeatureState("sorting")).toEqual([{ id: "name", desc: true }]);
    expect(store().getFeatureState("pagination")).toEqual({ pageIndex: 2, pageSize: 25 });
    expect(store().getFeatureState("filtering")).toEqual({ search: "", role: "admin" });
  });

  it("gives every slice of the schema the same group binding", () => {
    const { result } = renderHook(() => useNuqsBinding(usersUrl), { wrapper: withNuqsTestingAdapter() });
    const { sorting, pagination, filtering } = result.current;
    expect(sorting.kind).toBe("controlled-group");
    expect(pagination).toBe(sorting);
    expect(filtering).toBe(sorting);
    expect(Object.keys(result.current)).toEqual(["sorting", "pagination", "filtering"]);
  });

  it("writes table changes back to the URL", async () => {
    const { store, query } = setup();
    act(() => store().sorting.toggle("name"));
    await waitFor(() => expect(query()).toBe("?sort=name"));
    expect(store().getFeatureState("sorting")).toEqual([{ id: "name", desc: false }]);
  });

  it("resets the page with a new filter in one URL update", async () => {
    const { store, updates, query } = setup("?page=4");
    expect(store().getFeatureState("pagination").pageIndex).toBe(3);
    act(() => store().filtering.set("role", "member"));
    await waitFor(() => expect(updates).toHaveLength(1));
    // The page reset clears `page`, its default, in the same update.
    expect(query()).toBe("?role=member");
    expect(store().getFeatureState("pagination").pageIndex).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(updates).toHaveLength(1);
  });

  it("keeps both of two commands in one handler", async () => {
    const { store, updates, query } = setup();
    act(() => {
      store().filtering.set("search", "ada");
      store().sorting.toggle("name");
    });
    await waitFor(() => expect(query()).toBe("?search=ada&sort=name"));
    expect(updates).toHaveLength(1);
    expect(store().getFeatureState("filtering")).toEqual({ search: "ada" });
    expect(store().getFeatureState("sorting")).toEqual([{ id: "name", desc: false }]);
  });

  it("leaves defaults out of the URL unless asked to keep them", async () => {
    const cleared = setup("?page=2");
    act(() => cleared.store().pagination.setPage(0));
    await waitFor(() => expect(cleared.query()).toBe(""));
    cleanup();

    const kept = setup("", { clearOnDefault: false });
    act(() => kept.store().pagination.setPage(1));
    // An empty sort is `sort=`, as core writes it.
    await waitFor(() => expect(kept.query()).toBe("?sort=&page=2&pageSize=10&search="));
  });

  it("puts the prefix on every query key", async () => {
    const { store, query } = setup("?users_page=2&page=5", { prefix: "users_" });
    expect(store().getFeatureState("pagination").pageIndex).toBe(1);
    act(() => store().filtering.set("search", "x"));
    await waitFor(() => expect(query()).toBe("?page=5&users_search=x"));
  });

  it("keeps a slice's object while its parameters stay the same", async () => {
    const { store, query } = setup("?sort=name");
    const sorting = store().getFeatureState("sorting");
    act(() => store().filtering.set("search", "x"));
    await waitFor(() => expect(query()).toBe("?sort=name&search=x"));
    expect(store().getFeatureState("sorting")).toBe(sorting);
  });

  it("passes the navigation options to nuqs", async () => {
    const startTransition = vi.fn<(callback: () => void) => void>((callback) => callback());
    const { store, updates } = setup("", { shallow: false, history: "push", startTransition });
    act(() => store().sorting.toggle("name"));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]?.options).toMatchObject({ shallow: false, history: "push" });
  });
});

/** A search box bound to the filter, as an app writes it. */
function SearchBox({ options }: { readonly options: NuqsBindingOptions }) {
  const store = useUsers(options);
  const [search, setSearch] = useState(() => store.getFeatureState("filtering").search ?? "");
  useEffect(() => store.subscribeFeature("filtering", () => setSearch(store.getFeatureState("filtering").search ?? "")), [store]);
  return <input aria-label="search" value={search} onChange={(event) => store.filtering.set("search", event.target.value)} />;
}

describe("useNuqsBinding with a debounce", () => {
  it.each([
    ["one wait for every key", 200],
    ["a wait for the search key", { search: 200 }],
    ["a wait for the filtering slice", { filtering: 200 }],
  ] as const)("updates the input at once and the URL after the wait, with %s", async (_, debounceMs) => {
    const updates: UrlUpdateEvent[] = [];
    render(<SearchBox options={{ debounceMs }} />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "?page=3", hasMemory: true, rateLimitFactor: 1, onUrlUpdate: (event) => updates.push(event) }),
    });
    const input = screen.getByLabelText<HTMLInputElement>("search");
    // Keystrokes closer together than the wait, so the page reset from the
    // first one would land on its own if each key waited alone.
    for (const value of ["a", "ad", "ada"]) {
      fireEvent.change(input, { target: { value } });
      expect(input.value).toBe(value);
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    }
    expect(updates).toHaveLength(0);
    // The debounced change carries the page reset with it.
    await waitFor(() => expect(updates).toHaveLength(1), { timeout: 1000 });
    expect(updates[0]?.queryString).toBe("?search=ada");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(updates).toHaveLength(1);
  });

  it("sends a waiting change along with one that doesn't wait", async () => {
    const updates: UrlUpdateEvent[] = [];
    const view = renderHook(() => useUsers({ debounceMs: { search: 200 } }), {
      wrapper: withNuqsTestingAdapter({ searchParams: "?page=3", hasMemory: true, rateLimitFactor: 1, onUrlUpdate: (event) => updates.push(event) }),
    });
    act(() => view.result.current.filtering.set("search", "ada"));
    act(() => view.result.current.sorting.toggle("name"));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]?.queryString).toBe("?sort=name&search=ada");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(updates).toHaveLength(1);
  });
});
