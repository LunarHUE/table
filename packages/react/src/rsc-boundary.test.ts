import { defineTableUrl, enumParam, pageCodec, parseTableUrl, sortCodec, stringParam } from "@lunarhue/table-core/url";
import { describe, expect, it } from "vitest";
import * as server from "./server.js";
import {
  defineCell,
  defineColumn,
  defineTable,
  remoteFiltering,
  remotePagination,
  remoteSorting,
  selectable,
  selection,
  withProps,
} from "./server.js";

// A React Server Component graph imports the package through the
// `react-server` condition and hands it client components as references:
// proxies that throw on any touch. Everything a server component calls must
// copy them and never look inside.

/** Loads a module the test only needs as data. The path is a variable, so Vite loads it at run time. */
const load = async (path: string): Promise<unknown> => {
  const mod: unknown = await import(/* @vite-ignore */ path);
  return typeof mod === "object" && mod !== null && "default" in mod ? mod.default : mod;
};

/** A file's text, through Vite's `?raw` suffix. */
const source = async (path: string): Promise<string> => {
  const text = await load(`${path}?raw`);
  if (typeof text !== "string") throw new Error(`${path} didn't load as text.`);
  return text;
};

type Exports = string | null | { readonly [condition: string]: Exports };

/** Resolves an export target as Node does: the first key, in order, that is in `conditions` or is `default`. */
function resolveTarget(target: Exports, conditions: ReadonlySet<string>): string | undefined {
  if (typeof target === "string") return target;
  if (target === null) return undefined;
  for (const [key, value] of Object.entries(target)) {
    if (key !== "default" && !conditions.has(key)) continue;
    const found = resolveTarget(value, conditions);
    if (found !== undefined) return found;
  }
  return undefined;
}

const isExports = (value: unknown): value is Exports =>
  typeof value === "string" || value === null || (typeof value === "object" && !Array.isArray(value));

async function rootExport(): Promise<Exports> {
  const manifest = await load("../package.json");
  if (typeof manifest !== "object" || manifest === null || !("exports" in manifest)) throw new Error("No exports.");
  const { exports } = manifest;
  if (typeof exports !== "object" || exports === null || !("." in exports)) throw new Error("No root export.");
  const root: unknown = exports["."];
  if (!isExports(root)) throw new Error("The root export isn't a target.");
  return root;
}

describe("the react-server export", () => {
  const cases = [
    { conditions: ["react-server", "import", "types"], target: "./dist/esm/server.d.ts" },
    { conditions: ["react-server", "import"], target: "./dist/esm/server.js" },
    { conditions: ["react-server", "require", "types"], target: "./dist/cjs/server.d.ts" },
    { conditions: ["react-server", "require"], target: "./dist/cjs/server.js" },
    { conditions: ["@lunarhue/source", "react-server", "import"], target: "./src/server.ts" },
    { conditions: ["import"], target: "./dist/esm/index.js" },
    { conditions: ["@lunarhue/source", "import"], target: "./src/index.ts" },
  ];

  it.each(cases)("resolves $conditions to $target", async ({ conditions, target }) => {
    expect(resolveTarget(await rootExport(), new Set(conditions))).toBe(target);
  });
});

/** A stand-in for a client reference: every one of a proxy's 13 traps throws, and each call is counted. */
function clientReference(name: string) {
  const fired: string[] = [];
  const trap =
    (kind: string) =>
    (): never => {
      fired.push(kind);
      throw new Error(`${name}: the ${kind} trap ran on a client reference.`);
    };
  const handler: Required<ProxyHandler<() => null>> = {
    apply: trap("apply"),
    construct: trap("construct"),
    defineProperty: trap("defineProperty"),
    deleteProperty: trap("deleteProperty"),
    get: trap("get"),
    getOwnPropertyDescriptor: trap("getOwnPropertyDescriptor"),
    getPrototypeOf: trap("getPrototypeOf"),
    has: trap("has"),
    isExtensible: trap("isExtensible"),
    ownKeys: trap("ownKeys"),
    preventExtensions: trap("preventExtensions"),
    set: trap("set"),
    setPrototypeOf: trap("setPrototypeOf"),
  };
  return { reference: new Proxy(() => null, handler), fired };
}

interface Member {
  readonly id: string;
  readonly name: string;
  readonly role: "admin" | "member";
}

interface Filters {
  readonly search?: string;
  readonly role?: "admin" | "member";
}

describe("definitions in a server component", () => {
  it("pass client references through without touching them", () => {
    const refs = {
      cell: clientReference("cell"),
      header: clientReference("header"),
      footer: clientReference("footer"),
      nameCell: clientReference("nameCell"),
      select: clientReference("select"),
      badge: clientReference("badge"),
      statusCell: clientReference("statusCell"),
    };
    const { cell, header, footer, nameCell, select, badge, statusCell } = {
      cell: refs.cell.reference,
      header: refs.header.reference,
      footer: refs.footer.reference,
      nameCell: refs.nameCell.reference,
      select: refs.select.reference,
      badge: refs.badge.reference,
      statusCell: refs.statusCell.reference,
    };

    const status = defineColumn("status", { cell: statusCell, header, footer });
    const SelectCell = defineCell(select, selectable());
    const Badge = withProps(badge, { tone: "neutral" });

    const membersTable = defineTable<Member>()({
      getRowId: (member) => member.id,
      columns: (col) => [
        col.custom("select", { parts: [selectable()], cell: SelectCell, header }),
        col.key("name", { sortable: true, cell: nameCell, header, footer }),
        col.key("role", { cell: Badge }),
        col.accessor("initial", (member) => member.name.slice(0, 1), { cell, header, footer }),
        status,
      ],
      features: [remoteSorting(), remoteFiltering<Filters>(), remotePagination({ sizes: [10, 25] }), selection()],
    });

    const membersUrl = defineTableUrl(membersTable, {
      sorting: sortCodec(),
      pagination: pageCodec(),
      filtering: { search: stringParam({ trim: true }), role: enumParam(["admin", "member"]) },
    });
    const parsed = parseTableUrl(membersUrl, "?sort=-name&page=2&search=%20ali%20&role=admin");

    for (const ref of Object.values(refs)) expect(ref.fired).toEqual([]);
    expect(SelectCell).toBe(select);
    expect(membersTable.columns.map((column) => column.id)).toEqual(["select", "name", "role", "initial", "status"]);

    expect(parsed.state).toEqual({
      sorting: [{ id: "name", desc: true }],
      pagination: { pageIndex: 1, pageSize: 10 },
      filtering: { search: "ali", role: "admin" },
    });
    expect(parsed.request).toEqual({
      sorting: [{ id: "name", desc: true }],
      filtering: { search: "ali", role: "admin" },
      pagination: { pageIndex: 1, pageSize: 10 },
    });
    expect(typeof parsed.requestKey).toBe("string");
    const dehydrated = parsed.dehydrate();
    expect(dehydrated).toEqual({ request: parsed.request, requestKey: parsed.requestKey });
    // What goes over the wire to the client must survive serialization.
    expect(JSON.parse(JSON.stringify(dehydrated))).toEqual(dehydrated);
    expect(parsed.serialize().toString()).toBe("sort=-name&page=2&search=ali&role=admin");
  });
});

describe("the server entry", () => {
  it("exports no hooks and no components", () => {
    const names = Object.keys(server);
    expect(names.filter((name) => /^use[A-Z]/.test(name))).toEqual([]);
    expect(names).not.toContain("Cell");
    expect(names).not.toContain("Header");
    for (const name of ["defineTable", "defineColumn", "defineCell", "withProps", "selectable", "remoteSorting"]) {
      expect(names).toContain(name);
    }
  });

  it("imports React only for types, through every local module it pulls in", async () => {
    // Walk the local imports from server.ts and collect every import of "react".
    const seen = new Set<string>();
    const reactImports: string[] = [];
    const queue = ["./server.ts"];
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      if (seen.has(path)) continue;
      seen.add(path);
      const text = await source(path);
      for (const match of text.matchAll(/^(?:import|export)\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gms)) {
        const [statement, typeOnly, from] = match;
        if (from === undefined) continue;
        if (from.startsWith("./")) {
          if (typeOnly === undefined) queue.push(from.replace(/\.js$/, ".ts"));
        } else if (from === "react" || from.startsWith("react/") || from.startsWith("react-dom") || from === "#lunarhue/react") {
          if (typeOnly === undefined) reactImports.push(statement);
        }
      }
    }
    expect(seen).toEqual(new Set(["./server.ts", "./define-cell.ts"]));
    expect(reactImports).toEqual([]);
  });
});
