import { describe, expect, it, vi } from "vitest";
import type { ColumnInfo, RowLike, RowStagePhase } from "./contract.js";
import { defineTable } from "./define-table.js";
import { defineFeature, type AnyFeature } from "./feature.js";
import { problem } from "./problem.js";
import { createRowPipeline, type Row } from "./row-pipeline.js";

interface User {
  readonly id: string;
  readonly name: string;
}

const users: readonly User[] = [
  { id: "a", name: "Ada" },
  { id: "b", name: "Bob" },
  { id: "c", name: "Cy" },
  { id: "d", name: "Dee" },
];
const columns: readonly ColumnInfo[] = [{ id: "name" }];
const empty: readonly string[] = [];
const key = () => "k2";
const ids = (rows: readonly RowLike[]) => rows.map((row) => row.id);

/** A pipeline over `features`, reading state from a map the test changes. */
function setup(features: readonly AnyFeature[]) {
  const def = defineTable<User>()({ getRowId: (row) => row.id, columns: (col) => [col.key("name")], features });
  const state = new Map<string, unknown>();
  // A slice nobody set reads as an empty list, the stages' starting state.
  const compute = createRowPipeline(def, (name) => state.get(name) ?? empty);
  return { state, compute };
}

/** A stage that logs its phase and keeps the rows whose id isn't in its state. */
function stage(name: string, phase: RowStagePhase, log: string[], reads?: readonly string[]) {
  return defineFeature({
    name,
    state: { initial: [] as readonly string[] },
    rowStage: {
      phase,
      ...(reads ? { reads } : {}),
      run: (rows, ctx) => {
        log.push(name);
        return rows.filter((row) => !ctx.state.includes(row.id));
      },
    },
  })();
}

describe("createRowPipeline", () => {
  it("makes frozen data rows with the ids getRowId returns", () => {
    const getRowId = vi.fn<(row: User) => string>((row) => row.id);
    const def = defineTable<User>()({ getRowId, columns: (col) => [col.key("name")] });
    const view = createRowPipeline(def, () => undefined)(users, columns);
    expect(getRowId).toHaveBeenNthCalledWith(2, users[1], { index: 1, parentId: null });
    expect(view.rows[1]).toEqual({
      kind: "data",
      id: "b",
      index: 1,
      depth: 0,
      parentId: null,
      canExpand: false,
      isExpanded: false,
      original: users[1],
    });
    expect(Object.isFrozen(view.rows[1])).toBe(true);
    expect(Object.isFrozen(view.rows)).toBe(true);
  });

  it("throws row:duplicate-id for two rows with one id", () => {
    const { compute } = setup([]);
    expect(() => compute([...users, { id: "b", name: "Other" }], columns)).toThrow(problem("row:duplicate-id", "b"));
  });

  it("keeps row objects whose fields didn't change", () => {
    const { compute } = setup([]);
    const first = compute(users, columns);
    expect(compute(users, columns)).toBe(first);
    // A new array of the same items keeps the rows array too.
    expect(compute([...users], columns).rows).toBe(first.rows);
    const renamed = [users[0], { id: "b", name: "Bea" }, users[2], users[3]].filter((user) => user !== undefined);
    const next = compute(renamed, columns).rows;
    expect(next).not.toBe(first.rows);
    expect(next[0]).toBe(first.rows[0]);
    expect(next[1]).not.toBe(first.rows[1]);
    expect(next[2]).toBe(first.rows[2]);
    // A row that moves gets a new index, and so a new object.
    const moved = compute([users[1], users[0]].filter((user) => user !== undefined), columns).rows;
    expect(moved[0]?.index).toBe(0);
    expect(moved[0]).not.toBe(next[1]);
  });

  it("runs stages phase by phase, in feature order within a phase", () => {
    const log: string[] = [];
    const { compute } = setup([
      stage("dec", "decorate", log),
      stage("win", "window", log),
      stage("flat", "flatten", log),
      stage("sort2", "sort", log),
      stage("filt", "filter", log),
      stage("sort1", "sort", log),
    ]);
    compute(users, columns);
    expect(log).toEqual(["filt", "sort2", "sort1", "flat", "win", "dec"]);
  });

  it("runs a stage again only when its input, its state or a slice it reads changes", () => {
    const log: string[] = [];
    const { state, compute } = setup([stage("filt", "filter", log), stage("sorter", "sort", log, ["filters"])]);
    const first = compute(users, columns);
    expect(log).toEqual(["filt", "sorter"]);

    // A slice no stage reads, such as column visibility, runs nothing.
    state.set("visibility", ["name"]);
    expect(compute(users, columns)).toBe(first);
    expect(log).toEqual(["filt", "sorter"]);

    state.set("filters", { name: "x" });
    compute(users, columns);
    expect(log).toEqual(["filt", "sorter", "sorter"]);

    state.set("filt", ["a"]);
    expect(ids(compute(users, columns).rows)).toEqual(["b", "c", "d"]);
    expect(log).toEqual(["filt", "sorter", "sorter", "filt", "sorter"]);

    // Equal data in a new array doesn't run anything.
    compute([...users], columns);
    expect(log).toHaveLength(5);
  });

  it("counts matching rows before the window phase", () => {
    const log: string[] = [];
    const page = defineFeature({
      name: "page",
      state: { initial: 2 },
      rowStage: { phase: "window", run: (rows, ctx) => rows.slice(0, ctx.state) },
    })();
    const { state, compute } = setup([stage("filt", "filter", log), page]);
    state.set("page", 2);
    state.set("filt", ["d"]);
    const view = compute(users, columns);
    expect(ids(view.rows)).toEqual(["a", "b"]);
    expect(view.matchingCount).toBe(3);
    expect(view.totalCount).toBe(3);
    expect(view.pageCount).toBeUndefined();
    expect(compute(users, columns, { pageSize: 2 }).pageCount).toBe(2);
    const remote = compute(users, columns, { totalCount: 41, pageSize: 10, error: "boom", isPlaceholder: true });
    expect(remote).toMatchObject({ totalCount: 41, pageCount: 5, error: "boom", isPlaceholder: true, isStale: false });
    expect(compute(users, columns, { pageSize: 0 }).pageCount).toBeUndefined();
  });

  it("counts every row as matching without a window stage", () => {
    const { compute } = setup([]);
    expect(compute(users, columns).matchingCount).toBe(4);
  });

  it("marks the view stale when its request key differs from the table's", () => {
    const { compute } = setup([]);
    expect(compute(users, columns, { requestKey: "k1" }, key).isStale).toBe(true);
    expect(compute(users, columns, { requestKey: "k2" }, key).isStale).toBe(false);
    expect(compute(users, columns, {}, key).isStale).toBe(false);
  });

  it("makes detail rows from a flatten stage and keeps them across runs", () => {
    const expand = defineFeature({
      name: "expand",
      state: { initial: [] as readonly string[] },
      rowStage: {
        phase: "flatten",
        run: (rows, ctx) =>
          rows.flatMap((row): RowLike[] => {
            if (!ctx.state.includes(row.id)) return [row];
            const open = { ...row, canExpand: true, isExpanded: true };
            return [open, { kind: "detail", id: `${row.id}:detail`, index: row.index, depth: 1, parentId: row.id, original: row.original }];
          }),
      },
    })();
    const { state, compute } = setup([expand]);
    state.set("expand", ["b"]);
    const rows = compute(users, columns).rows;
    expect(rows.map((row) => `${row.kind}:${row.id}`)).toEqual(["data:a", "data:b", "detail:b:detail", "data:c", "data:d"]);
    const detail: Row<User> | undefined = rows[2];
    if (detail?.kind !== "detail") throw new Error("expected a detail row");
    expect(detail.parentId).toBe("b");
    expect(detail.original).toBe(users[1]);
    expect(rows[1]).toMatchObject({ canExpand: true, isExpanded: true });

    // The stage runs again with equal state and makes new objects; the rows stay the same objects.
    state.set("expand", ["b"]);
    const again = compute(users, columns).rows;
    expect(again).toBe(rows);
  });
});
