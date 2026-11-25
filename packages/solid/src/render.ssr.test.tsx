import { renderToString } from "@solidjs/web";
import { describe, expect, it } from "vitest";
import { createFeatureState, createRowState, createTable, type StateOf } from "./index.js";
import { counted } from "./test/counted.js";
import { DataTable, makeDef, people } from "./test/fixture.js";

describe("server rendering", () => {
  it("renders the table from server snapshots and subscribes to nothing", () => {
    const { table, live } = counted(createTable(makeDef()));
    const html = renderToString(() => <DataTable table={table} data={people} />);
    expect(html).toContain("Ada");
    expect(html).toContain("2021-03-04");
    expect(html).not.toContain("Cal");
    expect(live()).toBe(0);
  });

  it("reads each slice's server snapshot", () => {
    let sort: StateOf<ReturnType<typeof makeDef>>["sorting"] = [{ id: "name", desc: true }];
    const table = createTable(makeDef(), {
      bind: { sorting: { get: () => sort, getServerSnapshot: () => [], set: (next: typeof sort) => (sort = next), subscribe: () => () => {} } },
    });
    const html = renderToString(() => {
      const sorting = createFeatureState(table, "sorting");
      const selected = createRowState(table, "u1", "selection");
      return <p>{`${sorting().length}:${String(selected())}`}</p>;
    });
    expect(html).toContain("0:false");
  });
});
