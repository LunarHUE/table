import { describe, expect, it, vi } from "vitest";
import { cellKey, createCell, createCells, createKeyedCells } from "./cells.js";

describe("createCells", () => {
  it("wakes a listener once per change and skips equal snapshots", () => {
    const [replace, listen, flush] = createCells();
    const cell = createCell(1);
    const listener = vi.fn<() => void>();
    listen(cell, listener);

    replace(cell, 1);
    flush();
    expect(listener).not.toHaveBeenCalled();

    replace(cell, 2);
    replace(cell, 3);
    flush();
    flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(cell.snapshot).toBe(3);
  });

  it("keeps the identity of an equal object snapshot", () => {
    const [replace] = createCells();
    const value = { a: 1 };
    const cell = createCell(value);
    replace(cell, value);
    expect(cell.snapshot).toBe(value);
    replace(cell, { a: 1 });
    expect(cell.snapshot).not.toBe(value);
  });

  it("treats NaN as equal to itself", () => {
    const [replace, listen, flush] = createCells();
    const cell = createCell(Number.NaN);
    const listener = vi.fn<() => void>();
    listen(cell, listener);
    replace(cell, Number.NaN);
    flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the first snapshot of a change in `before` until listeners run", () => {
    const [replace, listen, flush] = createCells();
    const cell = createCell("a");
    listen(cell, () => {});
    replace(cell, "b");
    replace(cell, "c");
    expect(cell.before).toBe("a");
    flush();
    expect(cell.before).toBeUndefined();
  });

  it("doesn't wake a listener whose cell changed back", () => {
    const [replace, listen, flush] = createCells();
    const cell = createCell(1);
    const listener = vi.fn<() => void>();
    listen(cell, listener);
    replace(cell, 2);
    replace(cell, 1);
    flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it("holds listeners until the outermost batch returns", () => {
    const [replace, listen, , batch] = createCells();
    const a = createCell(0);
    const b = createCell(0);
    const calls: string[] = [];
    listen(a, () => calls.push("a"));
    listen(b, () => calls.push("b"));

    const result = batch(() => {
      replace(a, 1);
      batch(() => replace(b, 1));
      expect(calls).toEqual([]);
      return "done";
    });

    expect(result).toBe("done");
    expect(calls).toEqual(["a", "b"]);
  });

  it("flushes when a batch throws", () => {
    const [replace, listen, , batch] = createCells();
    const cell = createCell(0);
    const listener = vi.fn<() => void>();
    listen(cell, listener);
    expect(() =>
      batch(() => {
        replace(cell, 1);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("runs the remaining listeners, then throws the first error", () => {
    const [replace, listen, flush] = createCells();
    const a = createCell(0);
    const b = createCell(0);
    const after = vi.fn<() => void>();
    listen(a, () => {
      throw new Error("first");
    });
    listen(a, () => {
      throw new Error("second");
    });
    listen(b, after);
    replace(a, 1);
    replace(b, 1);
    expect(flush).toThrow("first");
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("drops the subscription set and the pending entry with the last listener", () => {
    const [replace, listen, flush] = createCells();
    const cell = createCell(0);
    const listener = vi.fn<() => void>();
    const unlisten = listen(cell, listener);
    replace(cell, 1);
    unlisten();
    unlisten();
    expect(cell.subscriptions).toBeUndefined();
    expect(cell.before).toBeUndefined();
    flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it("skips a listener removed by an earlier one in the same flush", () => {
    const [replace, listen, flush] = createCells();
    const cell = createCell(0);
    const second = vi.fn<() => void>();
    let unlistenSecond: (() => void) | undefined;
    listen(cell, () => unlistenSecond?.());
    unlistenSecond = listen(cell, second);
    replace(cell, 1);
    flush();
    expect(second).not.toHaveBeenCalled();
  });

  it("queues nothing for a cell without listeners", () => {
    const [replace] = createCells();
    const cell = createCell(0);
    replace(cell, 1);
    expect(cell.snapshot).toBe(1);
    expect(cell.before).toBeUndefined();
  });
});

/** A row store reading whether each row is selected. */
function rowsStore() {
  const cells = createCells();
  const selected = new Set<string>();
  const read = vi.fn<(id: string) => boolean>((id) => selected.has(id));
  const rows = createKeyedCells(cells, read);
  return { cells, selected, read, rows };
}

describe("createKeyedCells", () => {
  it("allocates nothing until a key is subscribed", () => {
    const { rows, read } = rowsStore();
    expect(rows.get("a")).toBe(false);
    expect(rows.size()).toBe(0);
    rows.notifyAll();
    expect(read).toHaveBeenCalledTimes(1);
    const off = rows.subscribe("a", () => {});
    expect(rows.size()).toBe(1);
    off();
    expect(rows.size()).toBe(0);
  });

  it("wakes only the row that changed", () => {
    const { rows, selected } = rowsStore();
    const a = vi.fn<() => void>();
    const b = vi.fn<() => void>();
    rows.subscribe("a", a);
    rows.subscribe("b", b);

    selected.add("a");
    rows.notifyAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(rows.get("a")).toBe(true);

    selected.delete("a");
    rows.notifyKey("a");
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).not.toHaveBeenCalled();
  });

  it("reads only the keys it is told about", () => {
    const { rows, read } = rowsStore();
    rows.subscribe("a", () => {});
    rows.subscribe("b", () => {});
    read.mockClear();
    rows.notifyKeys(["a", "zzz"]);
    expect(read.mock.calls).toEqual([["a"]]);
  });

  it("wakes the keys of one notifyKeys call together", () => {
    const { rows, selected } = rowsStore();
    const order: string[] = [];
    rows.subscribe("a", () => order.push(`a:${rows.get("b")}`));
    rows.subscribe("b", () => order.push("b"));
    selected.add("a").add("b");
    rows.notifyKeys(["a", "b"]);
    // When a's listener runs, b's snapshot is already new.
    expect(order).toEqual(["a:true", "b"]);
  });

  it("holds wakes inside an outer batch", () => {
    const { rows, selected, cells } = rowsStore();
    const [, , , batch] = cells;
    const a = vi.fn<() => void>();
    rows.subscribe("a", a);
    batch(() => {
      selected.add("a");
      rows.notifyKey("a");
      expect(a).not.toHaveBeenCalled();
    });
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("keeps a key's cell while any listener remains", () => {
    const { rows, selected } = rowsStore();
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    const offFirst = rows.subscribe("a", first);
    const offSecond = rows.subscribe("a", second);
    offFirst();
    expect(rows.size()).toBe(1);
    selected.add("a");
    rows.notifyKey("a");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    offSecond();
    offSecond();
    expect(rows.size()).toBe(0);
  });

  it("starts a re-subscribed key from a fresh read", () => {
    const { rows, selected } = rowsStore();
    rows.subscribe("a", () => {})();
    selected.add("a");
    const listener = vi.fn<() => void>();
    rows.subscribe("a", listener);
    expect(rows.get("a")).toBe(true);
    rows.notifyKey("a");
    expect(listener).not.toHaveBeenCalled();
  });

  it("doesn't let an old unsubscribe drop a newer cell", () => {
    const { rows } = rowsStore();
    const off = rows.subscribe("a", () => {});
    off();
    rows.subscribe("a", () => {});
    off();
    expect(rows.size()).toBe(1);
  });

  it("keeps cells of a (row, column) store apart", () => {
    const cells = createCells();
    const values = new Map<string, number>();
    const grid = createKeyedCells(cells, (key: string) => values.get(key) ?? 0);
    const a1 = vi.fn<() => void>();
    const a2 = vi.fn<() => void>();
    const b1 = vi.fn<() => void>();
    grid.subscribe(cellKey("a", "1"), a1);
    grid.subscribe(cellKey("a", "2"), a2);
    grid.subscribe(cellKey("b", "1"), b1);

    values.set(cellKey("a", "2"), 5);
    grid.notifyAll();
    expect(a1).not.toHaveBeenCalled();
    expect(a2).toHaveBeenCalledTimes(1);
    expect(b1).not.toHaveBeenCalled();
    expect(grid.get(cellKey("a", "2"))).toBe(5);
  });

  it("doesn't confuse ids that join to the same text", () => {
    expect(cellKey("a-b", "c")).not.toBe(cellKey("a", "b-c"));
    expect(cellKey("a", "bc")).not.toBe(cellKey("ab", "c"));
  });
});
