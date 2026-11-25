import { describe, expect, it } from "vitest";
import {
  type Change,
  delta,
  diff,
  diffCompare,
  type LimitSize,
  marker,
  notable,
  parseTablesTable,
  raisedLimits,
  report,
  type Snapshot,
} from "./size-report.js";

const columns = ["React prod", "React dev", "Solid prod", "Solid dev"];

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    tables: {
      columns,
      rows: [
        { name: "Bare table", sizes: { "React prod": 5500, "React dev": 7500, "Solid prod": 5800, "Solid dev": 7800 } },
        { name: "Everything on", sizes: { "React prod": 9000, "React dev": 14000, "Solid prod": 8800, "Solid dev": 13500 } },
      ],
    },
    limits: [
      { package: "@lunarhue/table-core", name: ".", size: 8800, limit: 10000 },
      { package: "@lunarhue/table-react", name: "react, everything on", size: 11200 },
    ],
    compare: null,
    ...overrides,
  };
}

const limit = (name: string, size: number, ceiling?: number): LimitSize => ({
  package: "@lunarhue/table-core",
  name,
  size,
  ...(ceiling === undefined ? {} : { limit: ceiling }),
});

const change = (overrides: Partial<Change>): Change => ({
  source: "size-limit",
  group: "core",
  entry: ".",
  base: 1000,
  head: 1000,
  baseLimit: undefined,
  headLimit: undefined,
  ...overrides,
});

const options = { base: "main", sha: "0123456789abcdef" };

const apps = (brotli: number) => ({ users: { lunarhue: { table: { brotli } }, tanstack: { table: { brotli: 11910 } } } });

describe("parseTablesTable", () => {
  it("reads the table an older size:tables prints", () => {
    const markdown = [
      "Minified, brotli. React and Solid are external.",
      "",
      "| Table | React prod | Solid prod |",
      "| --- | ---: | ---: |",
      "| Bare table | 5,520 B | 5,840 B |",
      "| + sorting and pagination | 6,800 B | 7,100 B |",
    ].join("\n");
    expect(parseTablesTable(markdown)).toEqual({
      columns: ["React prod", "Solid prod"],
      rows: [
        { name: "Bare table", sizes: { "React prod": 5520, "Solid prod": 5840 } },
        { name: "+ sorting and pagination", sizes: { "React prod": 6800, "Solid prod": 7100 } },
      ],
    });
  });

  it("fails without a table", () => expect(() => parseTablesTable("nothing")).toThrow("printed no table"));
});

describe("diff", () => {
  it("pairs every table cell and size-limit entry", () => {
    const changes = diff(snapshot(), snapshot());
    expect(changes.filter((item) => item.source === "size:tables")).toHaveLength(8);
    expect(changes.filter((item) => item.source === "size-limit")).toHaveLength(2);
    expect(changes.every((item) => item.base === item.head)).toBe(true);
  });

  it("names packages without the scope", () => {
    expect(diff(null, snapshot()).find((item) => item.source === "size-limit")?.group).toBe("core");
  });

  it("keeps entries only one side has", () => {
    const base = snapshot({ limits: [limit("gone", 500)] });
    const head = snapshot({ limits: [limit("new", 700, 800)] });
    const limits = diff(base, head).filter((item) => item.source === "size-limit");
    expect(limits).toEqual([
      change({ entry: "new", base: undefined, head: 700, headLimit: 800 }),
      change({ entry: "gone", base: 500, head: undefined }),
    ]);
  });
});

describe("notable", () => {
  it("skips a move under the threshold", () => expect(notable(change({ base: 1000, head: 1009 }))).toBe(false));
  it("counts a move at the threshold", () => expect(notable(change({ base: 1000, head: 1010 }))).toBe(true));
  it("counts a shrink", () => expect(notable(change({ base: 1000, head: 980 }))).toBe(true));
  it("counts a new entry", () => expect(notable(change({ base: undefined }))).toBe(true));
  it("counts a removed entry", () => expect(notable(change({ head: undefined }))).toBe(true));

  it("counts a raised limit with no size change", () => {
    expect(notable(change({ baseLimit: 1200, headLimit: 1300 }))).toBe(true);
  });

  it("counts an entry that crosses close to its limit", () => {
    expect(notable(change({ base: 975, head: 981, baseLimit: 1000, headLimit: 1000 }))).toBe(true);
  });

  it("skips an entry that was already close to its limit", () => {
    expect(notable(change({ base: 985, head: 986, baseLimit: 1000, headLimit: 1000 }))).toBe(false);
  });

  it("counts an entry over its limit", () => {
    expect(notable(change({ base: 1001, head: 1002, baseLimit: 1000, headLimit: 1000 }))).toBe(true);
  });
});

describe("raisedLimits", () => {
  it("finds limits that went up, and only those", () => {
    const raised = change({ entry: "raised", baseLimit: 1000, headLimit: 1100 });
    const changes = [
      raised,
      change({ entry: "lowered", baseLimit: 1000, headLimit: 900 }),
      change({ entry: "set", headLimit: 1000 }),
      change({ entry: "same", baseLimit: 1000, headLimit: 1000 }),
    ];
    expect(raisedLimits(changes)).toEqual([raised]);
  });
});

describe("delta", () => {
  it("signs growth", () => expect(delta(10538, 10600)).toBe("+62 B / +0.6%"));
  it("signs a shrink", () => expect(delta(2000, 1500)).toBe("-500 B / -25.0%"));
  it("prints no change", () => expect(delta(1000, 1000)).toBe("0 B / 0.0%"));
  it("drops the percentage from zero", () => expect(delta(0, 120)).toBe("+120 B"));
});

describe("diffCompare", () => {
  it("lists the brotli sizes that changed", () => {
    expect(diffCompare(snapshot({ compare: apps(8850) }), snapshot({ compare: apps(8900) }))).toEqual([
      { app: "users", library: "lunarhue", build: "table", base: 8850, head: 8900 },
    ]);
  });

  it("lists nothing when the file is the same", () => {
    expect(diffCompare(snapshot({ compare: apps(8850) }), snapshot({ compare: apps(8850) }))).toEqual([]);
  });
});

describe("report", () => {
  it("says so in one line when nothing moved", () => {
    const text = report(snapshot(), snapshot(), options);
    expect(text.startsWith(`${marker}\n`)).toBe(true);
    expect(text).toContain("`0123456` vs `main`");
    expect(text).toContain("No significant bundle size changes vs `main`.");
    expect(text).not.toContain("Changed sizes");
    expect(text).toContain("<details>");
  });

  it("calls a move under the threshold no change", () => {
    const head = snapshot({ limits: [{ package: "@lunarhue/table-core", name: ".", size: 8805, limit: 10000 }] });
    const base = snapshot({ limits: [{ package: "@lunarhue/table-core", name: ".", size: 8800, limit: 10000 }] });
    expect(report(base, head, options)).toContain("No significant bundle size changes");
  });

  it("works cleanly when tables and compare are both null (size-limit only)", () => {
    const base = snapshot({ tables: null, limits: [limit(".", 8800, 10000)] });
    const head = snapshot({ tables: null, limits: [limit(".", 8920, 10000)] });
    const text = report(base, head, options);
    expect(text).toContain("| `size-limit` | core: . | 8,800 B → 8,920 B | +120 B / +1.4% |");
    expect(text).not.toContain("size:tables");
    expect(text).toContain("All size-limit entries");
  });

  it("tables what moved, with the full tables folded away", () => {
    const head = snapshot({
      limits: [
        { package: "@lunarhue/table-core", name: ".", size: 8862, limit: 10000 },
        { package: "@lunarhue/table-react", name: "react, everything on", size: 11200 },
      ],
    });
    expect(report(snapshot(), head, options)).toMatchInlineSnapshot(`
      "<!-- size-report -->

      ### Bundle size

      \`0123456\` vs \`main\`

      **Changed sizes**

      | Check | Entry | Base → PR | Δ |
      | --- | --- | ---: | ---: |
      | \`size-limit\` | core: . | 8,800 B → 8,862 B | +62 B / +0.7% |

      Bytes, brotli unless the entry says otherwise. Moves under 10 B are only in the full tables below.

      <details>
      <summary>All table sizes (<code>size:tables</code>)</summary>

      Minified, brotli. React and Solid are external.

      | Table | React prod | React dev | Solid prod | Solid dev |
      | --- | ---: | ---: | ---: | ---: |
      | Bare table | 5,500 B | 7,500 B | 5,800 B | 7,800 B |
      | Everything on | 9,000 B | 14,000 B | 8,800 B | 13,500 B |

      </details>

      <details>
      <summary>All size-limit entries</summary>

      | Package | Entry | Size | Δ | Limit | Headroom |
      | --- | --- | ---: | ---: | ---: | ---: |
      | core | . | 8,862 B | +62 B / +0.7% | 10,000 B | 1,138 B (11.4%) |
      | react | react, everything on | 11,200 B | 0 B / 0.0% | none |  |

      </details>
      "
    `);
  });

  it("shows table deltas in the full table", () => {
    const base = snapshot();
    const head = snapshot({
      tables: { columns, rows: [{ name: "Bare table", sizes: { "React prod": 5540, "React dev": 7500, "Solid prod": 5800, "Solid dev": 7800 } }] },
    });
    const text = report(base, head, options);
    expect(text).toContain("| `size:tables` | Bare table (React prod) | 5,500 B → 5,540 B | +40 B / +0.7% |");
    expect(text).toContain("| Bare table | 5,540 B (+40 B) | 7,500 B | 5,800 B | 7,800 B |");
    expect(text).toContain("| `size:tables` | Everything on (React prod) | 9,000 B → none | removed |");
    expect(text).toContain("| Everything on | removed | removed | removed | removed |");
  });

  it("marks new and removed entries", () => {
    const base = snapshot({ limits: [limit("gone", 500, 600)] });
    const head = snapshot({ limits: [limit("new", 700)] });
    const text = report(base, head, options);
    expect(text).toContain("| `size-limit` | core: new | none → 700 B | new |");
    expect(text).toContain("| `size-limit` | core: gone | 500 B → none | removed |");
    expect(text).toContain("| core | gone | removed | removed |  |  |");
    expect(text).not.toContain("limit removed");
  });

  it("lists a raised limit and notes it in the table", () => {
    const base = snapshot({ limits: [limit(".", 8800, 10000)] });
    const head = snapshot({ limits: [limit(".", 8800, 10500)] });
    const text = report(base, head, options);
    expect(text).toContain("| Check | Entry | Base → PR | Δ | Note |\n| --- | --- | ---: | ---: | --- |");
    expect(text).toContain("| core: . | 8,800 B → 8,800 B | 0 B / 0.0% | limit raised to 10,500 B |");
    expect(text).toContain("**Raised limits.**");
    expect(text).toContain("- core: ., 10,000 B → 10,500 B (+500 B)");
    expect(text).toContain("| core | . | 8,800 B | 0 B / 0.0% | 10,000 B → 10,500 B | 1,700 B (16.2%) |");
  });

  it("notes an entry over its limit", () => {
    const base = snapshot({ limits: [limit(".", 9400, 9450)] });
    const head = snapshot({ limits: [limit(".", 9500, 9450)] });
    const text = report(base, head, options);
    expect(text).toContain("over the 9,450 B limit");
    expect(text).toContain("over by 50 B");
  });

  it("adds the comparison apps when sizes.json changed", () => {
    const base = snapshot({ compare: { users: { lunarhue: { table: { brotli: 8850 } } } } });
    const head = snapshot({ compare: { users: { lunarhue: { table: { brotli: 8900 } } } } });
    expect(report(base, head, options)).toContain(
      "| users | lunarhue | Table + app | 8,850 B → 8,900 B | +50 B / +0.6% |",
    );
    expect(report(base, base, options)).not.toContain("Comparison apps");
  });

  it("compares no table sizes with a base that has no size:tables", () => {
    const text = report(snapshot({ tables: null }), snapshot(), options);
    expect(text).toContain("No significant bundle size changes");
    expect(text).toContain("The base has no `size:tables`");
    expect(text).toContain("| Bare table | 5,500 B | 7,500 B | 5,800 B | 7,800 B |");
  });

  it("prints the head alone without a base", () => {
    const text = report(null, snapshot(), options);
    expect(text).toContain("nothing to compare with");
    expect(text).not.toContain("Changed sizes");
    expect(text).toContain("| core | . | 8,800 B |  | 10,000 B | 1,200 B (12.0%) |");
  });
});
