import { describe, expect, it } from "vitest";
import { defineColumns } from "./column.js";
import { computeColumns, type ColumnStep, type HeaderGroup } from "./column-pipeline.js";
import type { ColumnViewInfo } from "./contract.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly city: string;
  readonly zip: string;
}

const columns = defineColumns<User>()((col) => [
  col.custom("select"),
  col.key("name", { label: "Name" }),
  col.key("email"),
  col.key("city", { group: "address" }),
  col.key("zip", { group: "address" }),
  col.custom("actions"),
]);
const none: ReadonlySet<string> = new Set();
const ids = (views: readonly ColumnViewInfo[]) => views.map((view) => view.id);
const hide =
  (...hidden: string[]): ColumnStep =>
  (views) =>
    views.map((view) => (hidden.includes(view.id) ? { ...view, visible: false } : view));
const pin =
  (zone: "start" | "end", ...pinned: string[]): ColumnStep =>
  (views) =>
    views.map((view) => (pinned.includes(view.id) ? { ...view, zone } : view));
const showAll: ColumnStep = (views) => views.map((view) => ({ ...view, visible: true }));
const extra: ColumnStep = (views) => [...views, { id: "ghost", visible: true, zone: "center", order: 9 }, ...views.slice(0, 1)];
const reverse: ColumnStep = (views) => views.map((_, i) => views[views.length - 1 - i]).filter((view) => view !== undefined);
/** Each header row as `id:colSpan:rowSpan`, with `~` before placeholders. */
const shape = <TRow>(groups: readonly HeaderGroup<TRow>[]) =>
  groups.map((group) => group.headers.map((cell) => `${cell.isPlaceholder ? "~" : ""}${cell.id}:${cell.colSpan}:${cell.rowSpan}`));

describe("computeColumns", () => {
  it("shows every column in the center without stages", () => {
    const result = computeColumns(columns, none, []);
    expect(ids(result.visibleColumns)).toEqual(["select", "name", "email", "city", "zip", "actions"]);
    expect(result.visibleColumns.map((view) => view.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.zones.start).toEqual([]);
    expect(result.zones.center).toEqual(result.visibleColumns);
    expect(result.allColumns).toEqual(result.visibleColumns);
    expect(result.visibleColumns[1]?.column).toBe(columns[1]);
    expect(result.visibleColumns[1]?.label).toBe("Name");
    expect(Object.isFrozen(result.visibleColumns[1])).toBe(true);
  });

  it("omits columns before any stage, so no stage can show them", () => {
    const result = computeColumns(columns, new Set(["email"]), [hide("email"), showAll]);
    expect(ids(result.allColumns)).not.toContain("email");
    expect(ids(result.visibleColumns)).not.toContain("email");
  });

  it("drops ids a stage invents or repeats", () => {
    expect(ids(computeColumns(columns, none, [extra]).allColumns)).toEqual(["select", "name", "email", "city", "zip", "actions"]);
  });

  it("keeps hidden columns in allColumns only", () => {
    const result = computeColumns(columns, none, [hide("email")]);
    expect(ids(result.allColumns)).toEqual(["select", "name", "email", "city", "zip", "actions"]);
    expect(ids(result.visibleColumns)).toEqual(["select", "name", "city", "zip", "actions"]);
    expect(result.allColumns[2]).toMatchObject({ id: "email", visible: false, order: -1 });
    // Shown columns are the same objects in both lists.
    expect(result.allColumns[1]).toBe(result.visibleColumns[1]);
  });

  it("runs stages in order and splits the shown columns into zones", () => {
    const result = computeColumns(columns, none, [reverse, pin("start", "select", "name"), pin("end", "email")]);
    expect(ids(result.zones.start)).toEqual(["name", "select"]);
    expect(ids(result.zones.center)).toEqual(["actions", "zip", "city"]);
    expect(ids(result.zones.end)).toEqual(["email"]);
    expect(ids(result.visibleColumns)).toEqual(["name", "select", "actions", "zip", "city", "email"]);
    expect(result.visibleColumns.map((view) => view.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("makes one header row when no shown column has a group", () => {
    const result = computeColumns(columns, new Set(["city", "zip"]), []);
    expect(shape(result.headerGroups)).toEqual([["select:1:1", "name:1:1", "email:1:1", "actions:1:1"]]);
    expect(result.headerGroups[0]?.headers[1]).toMatchObject({ columnId: "name", label: "Name", depth: 0, group: undefined });
  });

  it("makes two header rows when a shown column has a group", () => {
    const result = computeColumns(columns, none, [hide("email")]);
    expect(result.headerGroups.map((group) => group.id)).toEqual(["header-0", "header-1"]);
    expect(shape(result.headerGroups)).toEqual([
      ["select:1:2", "name:1:2", "address:city:2:1", "actions:1:2"],
      ["~select:placeholder:1:1", "~name:placeholder:1:1", "city:1:1", "zip:1:1", "~actions:placeholder:1:1"],
    ]);
    const [top, leaves] = result.headerGroups;
    expect(top?.headers[2]).toMatchObject({ group: "address", label: "address", columnId: undefined, column: undefined, depth: 0 });
    expect(leaves?.headers[2]).toMatchObject({ group: "address", columnId: "city", depth: 1, isPlaceholder: false });
    expect(leaves?.headers[0]).toMatchObject({ columnId: "select", isPlaceholder: true });
  });

  it("splits a group whose columns aren't neighbours", () => {
    const result = computeColumns(columns, none, [pin("end", "zip")]);
    expect(shape(result.headerGroups)[0]).toEqual(["select:1:2", "name:1:2", "email:1:2", "address:city:1:1", "actions:1:2", "address:zip:1:1"]);
  });
});
