import { expectTypeOf, it } from "vitest";
import { defineTable, type RequestOf, type StateOf } from "../define-table.js";
import { remoteFiltering } from "../features/filtering.js";
import { remotePagination, type PaginationState } from "../features/pagination.js";
import { remoteSorting } from "../features/sorting.js";
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
  type DehydratedTableUrl,
  type UrlParamCodec,
} from "./index.js";

interface User {
  readonly id: string;
  readonly name: string;
}

interface Filters {
  search?: string;
  role?: "admin" | "member";
  tags?: string[];
}

const usersTable = defineTable<User>()({
  getRowId: (row) => row.id,
  columns: [{ id: "name", sortable: true }, { id: "email" }],
  features: [remoteSorting(), remotePagination(), remoteFiltering<Filters>()],
});

const usersUrl = defineTableUrl(usersTable, {
  sorting: sortCodec(),
  pagination: pageCodec(),
  filtering: { search: stringParam({ default: "" }), role: enumParam(["admin", "member"]), tags: arrayParam(stringParam()) },
});

it("infers codec values", () => {
  expectTypeOf(enumParam(["admin", "member"])).toEqualTypeOf<UrlParamCodec<"admin" | "member" | undefined>>();
  expectTypeOf(enumParam(["admin", "member"]).parse("admin")).toEqualTypeOf<"admin" | "member" | undefined>();
  expectTypeOf(enumParam(["admin", "member"], { default: "admin" }).parse("x")).toEqualTypeOf<"admin" | "member">();
  expectTypeOf(stringParam().parse("x")).toEqualTypeOf<string | undefined>();
  expectTypeOf(stringParam({ default: "" }).parse("x")).toEqualTypeOf<string>();
  expectTypeOf(numberParam({ default: 1 }).parse("x")).toEqualTypeOf<number>();
  expectTypeOf(booleanParam().parse("x")).toEqualTypeOf<boolean | undefined>();
  expectTypeOf(arrayParam(enumParam(["a", "b"])).parse("a")).toEqualTypeOf<("a" | "b")[] | undefined>();
  // @ts-expect-error: not one of the values
  enumParam(["admin", "member"], { default: "root" });
});

it("types the parsed state and request", () => {
  const parsed = parseTableUrl(usersUrl, { page: "2" });
  expectTypeOf(parsed.request).toEqualTypeOf<RequestOf<typeof usersTable>>();
  expectTypeOf(parsed.dehydrate()).toEqualTypeOf<DehydratedTableUrl<RequestOf<typeof usersTable>>>();
  expectTypeOf(parsed.dehydrate().request.pagination.pageIndex).toEqualTypeOf<number>();
  expectTypeOf(parsed.state.sorting).toEqualTypeOf<StateOf<typeof usersTable>["sorting"]>();
  expectTypeOf(parsed.state.sorting[0]?.id).toEqualTypeOf<"name" | undefined>();
  expectTypeOf(parsed.state.pagination).toEqualTypeOf<PaginationState>();
  expectTypeOf(parsed.state.filtering).toEqualTypeOf<Filters>();
  expectTypeOf(usersUrl.defaults).toEqualTypeOf(parsed.state);
});

it("checks codecs against the table's slices", () => {
  // @ts-expect-error: a sort codec for the pagination slice
  defineTableUrl(usersTable, { pagination: sortCodec() });
  // @ts-expect-error: a number codec for a text filter
  defineTableUrl(usersTable, { filtering: { search: numberParam() } });
  // @ts-expect-error: a value the filter's type doesn't have
  defineTableUrl(usersTable, { filtering: { role: enumParam(["admin", "root"]) } });
  expectTypeOf(defineTableUrl(usersTable, { filtering: { role: enumParam(["admin"]) } }).defaults.filtering).toEqualTypeOf<Filters>();
});

it("types slices with no feature by their codecs", () => {
  const url = defineTableUrl(usersTable, { view: enumParam(["grid", "list"], { default: "list" }), panel: { open: booleanParam() } });
  expectTypeOf(url.defaults.view).toEqualTypeOf<"grid" | "list">();
  expectTypeOf(url.defaults.panel).toEqualTypeOf<{ readonly open: boolean | undefined }>();
});

it("writes partial state", () => {
  expectTypeOf(usersUrl.toQueryString({ pagination: { pageIndex: 1, pageSize: 10 } })).toEqualTypeOf<string>();
  // @ts-expect-error: not a sortable column
  usersUrl.toQueryString({ sorting: [{ id: "email", desc: false }] });
});
