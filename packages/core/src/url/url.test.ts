import { describe, expect, it } from "vitest";
import { defineTable } from "../define-table.js";
import { remoteFiltering } from "../features/filtering.js";
import { pagination, remotePagination } from "../features/pagination.js";
import { remoteSorting, sorting } from "../features/sorting.js";
import { createTableStore } from "../store.js";
import {
  arrayParam,
  booleanParam,
  defineTableUrl,
  enumParam,
  numberParam,
  pageCodec,
  parseTableUrl,
  sortCodec,
  stringParam,
  type UrlSearchParams,
} from "./index.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: string;
}

interface Filters {
  search?: string;
  role?: "admin" | "member";
  tags?: string[];
}

const columns = [
  { id: "name", sortable: true, getValue: (row: User) => row.name },
  { id: "email", getValue: (row: User) => row.email },
  { id: "createdAt", sortable: true, getValue: (row: User) => row.createdAt },
] as const;

const usersTable = defineTable<User>()({
  getRowId: (row) => row.id,
  columns,
  features: [remoteSorting(), remotePagination({ sizes: [10, 25, 50] }), remoteFiltering<Filters>()],
  initialState: { sorting: [{ id: "createdAt", desc: true }], filtering: { search: "" } },
});

const usersUrl = defineTableUrl(usersTable, {
  sorting: sortCodec(),
  pagination: pageCodec(),
  filtering: {
    search: stringParam({ trim: true }),
    role: enumParam(["admin", "member"]),
    tags: arrayParam(stringParam()),
  },
});

const query = (params: UrlSearchParams) => params.toString();

describe("param codecs", () => {
  it("reads strings, trimming when asked", () => {
    expect(stringParam().parse("a b")).toBe("a b");
    expect(stringParam().parse(undefined)).toBeUndefined();
    expect(stringParam({ default: "x" }).parse(undefined)).toBe("x");
    expect(stringParam({ trim: true }).parse("  hi ")).toBe("hi");
    expect(stringParam().parse(["first", "second"])).toBe("first");
    expect(stringParam().parse("")).toBe("");
    expect(stringParam().serialize("a")).toBe("a");
    expect(stringParam().serialize(undefined)).toBeUndefined();
  });

  it("reads numbers within bounds", () => {
    const n = numberParam({ min: 1, max: 10, integer: true });
    expect(n.parse("5")).toBe(5);
    expect(n.parse("0")).toBeUndefined();
    expect(n.parse("11")).toBeUndefined();
    expect(n.parse("2.5")).toBeUndefined();
    expect(n.parse("NaN")).toBeUndefined();
    expect(n.parse("abc")).toBeUndefined();
    expect(n.parse(" ")).toBeUndefined();
    expect(n.parse("Infinity")).toBeUndefined();
    expect(n.parse("abc", 3)).toBe(3);
    expect(numberParam({ default: 7 }).parse("x")).toBe(7);
    expect(numberParam().parse("2.5")).toBe(2.5);
    expect(n.serialize(4)).toBe("4");
  });

  it("reads booleans", () => {
    const b = booleanParam();
    expect(b.parse("true")).toBe(true);
    expect(b.parse("1")).toBe(true);
    expect(b.parse("false")).toBe(false);
    expect(b.parse("0")).toBe(false);
    expect(b.parse("yes")).toBeUndefined();
    expect(booleanParam({ default: false }).parse("yes")).toBe(false);
    expect(b.serialize(true)).toBe("true");
  });

  it("reads enums and rejects other strings", () => {
    const role = enumParam(["admin", "member"]);
    expect(role.parse("admin")).toBe("admin");
    expect(role.parse("root")).toBeUndefined();
    expect(enumParam(["admin", "member"], { default: "member" }).parse("root")).toBe("member");
  });

  it("parses form input on its own", () => {
    const role = enumParam(["admin", "member"]);
    let set: unknown = "unset";
    const onChange = (event: { readonly target: { readonly value: string } }) => (set = role.parse(event.target.value));
    onChange({ target: { value: "member" } });
    expect(set).toBe("member");
    onChange({ target: { value: "" } });
    expect(set).toBeUndefined();
  });

  it("reads repeated and delimited arrays", () => {
    const tags = arrayParam(stringParam());
    expect(tags.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(tags.parse("a,b")).toEqual(["a", "b"]);
    expect(tags.parse(["a,b", "c"])).toEqual(["a", "b", "c"]);
    expect(tags.parse("")).toEqual([]);
    expect(tags.parse(undefined)).toBeUndefined();
    expect(arrayParam(stringParam(), { separator: "|" }).parse("a|b,c")).toEqual(["a", "b,c"]);
    expect(tags.serialize(["a", "b"])).toBe("a,b");
    expect(tags.serialize(["a,b", "c"])).toEqual(["a,b", "c"]);
  });

  it("drops invalid array items, and rejects a list of only invalid items", () => {
    const roles = arrayParam(enumParam(["admin", "member"]));
    expect(roles.parse("admin,root,member")).toEqual(["admin", "member"]);
    expect(roles.parse("root")).toBeUndefined();
    expect(roles.parse("root", ["member"])).toEqual(["member"]);
  });
});

describe("sortCodec", () => {
  const table = defineTable<User>()({ getRowId: (row) => row.id, columns, features: [sorting()] });
  const parse = (raw: string, multi?: boolean) =>
    defineTableUrl(table, { sorting: sortCodec(multi === undefined ? {} : { multi }) }).parse({ sort: raw }).state.sorting;

  it("reads - as descending and a bare id as ascending", () => {
    expect(parse("-createdAt,name")).toEqual([
      { id: "createdAt", desc: true },
      { id: "name", desc: false },
    ]);
    expect(parse("name:desc,createdAt:asc")).toEqual([
      { id: "name", desc: true },
      { id: "createdAt", desc: false },
    ]);
  });

  it("drops unknown and unsortable ids, and repeats", () => {
    expect(parse("email,-bogus,name,-name")).toEqual([{ id: "name", desc: false }]);
    expect(parse("name:sideways")).toEqual([]);
  });

  it("falls back to the default when nothing is valid, and reads ?sort= as no sort", () => {
    expect(parse("email,bogus")).toEqual([]);
    expect(usersUrl.parse("sort=email").state.sorting).toEqual([{ id: "createdAt", desc: true }]);
    expect(usersUrl.parse("sort=").state.sorting).toEqual([]);
  });

  it("keeps one column with multi: false", () => {
    expect(parse("-createdAt,name", false)).toEqual([{ id: "createdAt", desc: true }]);
  });

  it("inherits multi: false from the feature", () => {
    const single = defineTable<User>()({ getRowId: (row) => row.id, columns, features: [sorting({ multi: false })] });
    expect(defineTableUrl(single, { sorting: sortCodec() }).parse("sort=name,-createdAt").state.sorting).toEqual([
      { id: "name", desc: false },
    ]);
  });

  it("writes the sort list", () => {
    const url = defineTableUrl(table, { sorting: sortCodec({ param: "s" }) });
    expect(
      url.toQueryString({
        sorting: [
          { id: "createdAt", desc: true },
          { id: "name", desc: false },
        ],
      }),
    ).toBe("s=-createdAt%2Cname");
  });
});

describe("pageCodec", () => {
  const table = defineTable<User>()({ getRowId: (row) => row.id, columns, features: [remotePagination({ sizes: [10, 25, 50] })] });
  const oneBased = defineTableUrl(table, { pagination: pageCodec() });
  const zeroBased = defineTableUrl(table, { pagination: pageCodec({ base: 0, pageParam: "p", sizeParam: "size" }) });

  it("reads 1-based pages", () => {
    expect(oneBased.parse("page=2").state.pagination).toEqual({ pageIndex: 1, pageSize: 10 });
    expect(oneBased.parse("page=1").state.pagination.pageIndex).toBe(0);
    expect(oneBased.parse("page=0").state.pagination.pageIndex).toBe(0);
    expect(oneBased.parse("page=-1").state.pagination.pageIndex).toBe(0);
    expect(oneBased.parse("page=1.5").state.pagination.pageIndex).toBe(0);
    expect(oneBased.parse("page=x").state.pagination.pageIndex).toBe(0);
  });

  it("reads 0-based pages", () => {
    expect(zeroBased.parse("p=0&size=25").state.pagination).toEqual({ pageIndex: 0, pageSize: 25 });
    expect(zeroBased.parse("p=3").state.pagination.pageIndex).toBe(3);
    expect(zeroBased.toQueryString({ pagination: { pageIndex: 2, pageSize: 50 } })).toBe("p=2&size=50");
  });

  it("falls back to the default size for one not allowed", () => {
    expect(oneBased.parse("pageSize=25").state.pagination.pageSize).toBe(25);
    expect(oneBased.parse("pageSize=33").state.pagination.pageSize).toBe(10);
    expect(oneBased.parse("pageSize=100").state.pagination.pageSize).toBe(10);
  });

  it("inherits sizes from the feature, and takes its own", () => {
    expect(oneBased.sizes).toEqual([10, 25, 50]);
    const own = defineTableUrl(table, { pagination: pageCodec({ sizes: [10, 100] }) });
    expect(own.sizes).toEqual([10, 100]);
    expect(own.parse("pageSize=100").state.pagination.pageSize).toBe(100);
    const plain = defineTable<User>()({ getRowId: (row) => row.id, columns, features: [pagination()] });
    expect(defineTableUrl(plain, { pagination: pageCodec() }).sizes).toEqual([10, 25, 50, 100]);
  });

  it("writes 1-based pages", () => {
    expect(oneBased.toQueryString({ pagination: { pageIndex: 1, pageSize: 25 } })).toBe("page=2&pageSize=25");
  });
});

describe("defineTableUrl", () => {
  it("inherits defaults from the table", () => {
    expect(usersUrl.defaults).toEqual({
      sorting: [{ id: "createdAt", desc: true }],
      pagination: { pageIndex: 0, pageSize: 10 },
      filtering: { search: "" },
    });
    expect(usersUrl.parse("").state).toEqual(usersUrl.defaults);
    expect(usersUrl.paramNames).toEqual(["sort", "page", "pageSize", "search", "role", "tags"]);
  });

  it("uses a codec's default only where the table has none", () => {
    const url = defineTableUrl(usersTable, { filtering: { search: stringParam({ default: "x" }), role: enumParam(["admin", "member"], { default: "admin" }) } });
    expect(url.defaults.filtering).toEqual({ search: "", role: "admin" });
    expect(url.parse("").state.filtering).toEqual({ search: "", role: "admin" });
  });

  it("writes nothing for the default state", () => {
    expect(usersUrl.toQueryString(usersUrl.defaults)).toBe("");
    expect(usersUrl.toQueryString({})).toBe("");
    expect(usersUrl.toQueryString(usersUrl.defaults, { clearOnDefault: false })).toBe("sort=-createdAt&page=1&pageSize=10&search=");
  });

  it("gives /users and /users?sort=-createdAt&page=1 the same state, request and key", () => {
    const bare = parseTableUrl(usersUrl, "");
    const explicit = parseTableUrl(usersUrl, "?sort=-createdAt&page=1");
    expect(explicit.state).toEqual(bare.state);
    expect(explicit.request).toEqual(bare.request);
    expect(explicit.requestKey).toBe(bare.requestKey);
    expect(query(explicit.serialize())).toBe("");
  });

  it("round-trips a state", () => {
    const parsed = usersUrl.parse("sort=name&page=3&pageSize=25&search=ada&role=admin&tags=a,b");
    expect(parsed.state).toEqual({
      sorting: [{ id: "name", desc: false }],
      pagination: { pageIndex: 2, pageSize: 25 },
      filtering: { search: "ada", role: "admin", tags: ["a", "b"] },
    });
    expect(query(parsed.serialize())).toBe("sort=name&page=3&pageSize=25&search=ada&role=admin&tags=a%2Cb");
    expect(usersUrl.parse(parsed.serialize()).state).toEqual(parsed.state);
  });

  it("drops filter keys whose value is invalid", () => {
    expect(usersUrl.parse("role=root").state.filtering).toEqual({ search: "" });
  });

  it("namespaces params with a prefix", () => {
    const parsed = usersUrl.parse("users_page=2&page=5&users_sort=name", { prefix: "users_" });
    expect(parsed.state.pagination.pageIndex).toBe(1);
    expect(parsed.state.sorting).toEqual([{ id: "name", desc: false }]);
    expect(query(parsed.serialize())).toBe("users_sort=name&users_page=2");
    expect(usersUrl.toQueryString({ filtering: { search: "a" } }, { prefix: "u." })).toBe("u.search=a");
    expect(usersUrl.getParamDescriptors({ prefix: "users_" }).map((param) => param.key)).toEqual([
      "users_sort",
      "users_page",
      "users_pageSize",
      "users_search",
      "users_role",
      "users_tags",
    ]);
  });

  it("reads URLSearchParams, query strings and Next.js records", () => {
    const expected = usersUrl.parse("page=2&tags=a&tags=b").state;
    const params = usersUrl.serialize({ pagination: { pageIndex: 1, pageSize: 10 } });
    params.append("tags", "a");
    params.append("tags", "b");
    expect(usersUrl.parse(params).state).toEqual(expected);
    expect(usersUrl.parse("?page=2&tags=a&tags=b").state).toEqual(expected);
    expect(usersUrl.parse({ page: "2", tags: ["a", "b"], role: undefined }).state).toEqual(expected);
    expect(usersUrl.parse({ page: ["2", "9"], tags: "a,b" }).state).toEqual(expected);
  });

  it("matches the store's request and key", () => {
    const cases = ["", "sort=name,-createdAt&page=4&pageSize=50", "search=%20ada%20&role=member&tags=x", "sort=&pageSize=999"];
    for (const text of cases) {
      const parsed = parseTableUrl(usersUrl, text);
      const store = createTableStore(usersTable, {
        bind: {
          sorting: { kind: "controlled", state: parsed.state.sorting, onStateChange: () => {} },
          pagination: { kind: "controlled", state: parsed.state.pagination, onStateChange: () => {} },
          filtering: { kind: "controlled", state: parsed.state.filtering, onStateChange: () => {} },
        },
      });
      expect(parsed.request).toEqual(store.getRequest());
      expect(parsed.requestKey).toBe(store.getRequestKey());
    }
    expect(parseTableUrl(usersUrl, "").requestKey).toBe(createTableStore(usersTable).getRequestKey());
  });

  it("puts default state in the request for slices outside the URL", () => {
    const sortOnly = defineTableUrl(usersTable, { sorting: sortCodec() });
    const parsed = sortOnly.parse("sort=name");
    expect(parsed.request).toEqual({
      sorting: [{ id: "name", desc: false }],
      pagination: { pageIndex: 0, pageSize: 10 },
      filtering: { search: "" },
    });
  });

  it("dehydrates to JSON", () => {
    const parsed = usersUrl.parse("sort=-name&page=2&tags=a");
    const dehydrated = parsed.dehydrate();
    expect(JSON.parse(JSON.stringify(dehydrated))).toEqual({ request: parsed.request, requestKey: parsed.requestKey });
    expect(Object.isFrozen(dehydrated)).toBe(true);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(usersUrl)).toBe(true);
  });

  it("keeps slices with no feature", () => {
    const url = defineTableUrl(usersTable, { view: enumParam(["grid", "list"], { default: "list" }), panel: { open: booleanParam() } });
    expect(url.defaults).toEqual({ view: "list", panel: {} });
    const parsed = url.parse("view=grid&open=1");
    expect(parsed.state).toEqual({ view: "grid", panel: { open: true } });
    expect(parsed.request).toEqual(createTableStore(usersTable).getRequest());
    expect(query(parsed.serialize())).toBe("view=grid&open=true");
  });

  it("describes each param for router bindings", () => {
    const [sort, page] = usersUrl.getParamDescriptors();
    expect(sort).toMatchObject({ key: "sort", slice: "sorting", default: [{ id: "createdAt", desc: true }] });
    expect(sort?.parse(undefined)).toEqual([{ id: "createdAt", desc: true }]);
    expect(sort?.parse("name")).toEqual([{ id: "name", desc: false }]);
    expect(page).toMatchObject({ key: "page", slice: "pagination", field: "pageIndex", default: 0 });
    expect(page?.parse("3")).toBe(2);
    expect(page?.serialize(2)).toBe("3");
    expect(page?.equals(0, 0)).toBe(true);
  });

  it("throws for two params with one key", () => {
    expect(() => defineTableUrl(usersTable, { pagination: pageCodec({ pageParam: "q" }), filtering: { search: stringParam({ param: "q" }) } })).toThrow(
      /two parameters use the key "q"/,
    );
  });

  it("never reads a column's renderers", () => {
    const touched: string[] = [];
    const trap = <T extends object>(column: T): T =>
      new Proxy(column, {
        get: (target, key, receiver) => {
          if (key === "cell" || key === "header" || key === "footer") touched.push(key);
          const value: unknown = Reflect.get(target, key, receiver);
          return value;
        },
      });
    const table = defineTable<User>()({
      getRowId: (row) => row.id,
      columns: [trap({ id: "name", sortable: true, cell: () => "x", header: () => "h", footer: () => "f" }), trap({ id: "email", cell: () => "y" })],
      features: [remoteSorting(), remotePagination()],
    });
    const url = defineTableUrl(table, { sorting: sortCodec(), pagination: pageCodec() });
    const parsed = parseTableUrl(url, "sort=-name&page=2");
    parsed.dehydrate();
    parsed.serialize();
    expect(parsed.request).toEqual({ sorting: [{ id: "name", desc: true }], pagination: { pageIndex: 1, pageSize: 10 } });
    expect(touched).toEqual([]);
  });
});
