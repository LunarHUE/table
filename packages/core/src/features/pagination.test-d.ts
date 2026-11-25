import { expectTypeOf, it } from "vitest";
import { defineTable, type RequestOf, type StateOf, type Table } from "../define-table.js";
import { hasFeature, type FeatureHost } from "../feature.js";
import { filtering, sorting, type User } from "../fixtures/table.js";
import { createTableStore } from "../store.js";
import {
  computePaginationMeta,
  pagination,
  remotePagination,
  type PaginationApi,
  type PaginationMeta,
  type PaginationRequest,
  type PaginationState,
} from "./pagination.js";

const columns = defineTable<User>()({ getRowId: (row) => row.id, columns: (col) => [col.key("name")] }).columns;

const client = defineTable<User>()({
  getRowId: (row) => row.id,
  columns,
  features: [sorting(), pagination({ sizes: [25, 50] })],
  initialState: { pagination: { pageIndex: 0, pageSize: 25 } },
});
const server = defineTable<User>()({ getRowId: (row) => row.id, columns, features: [filtering(), remotePagination({ mode: "cursor" })] });

it("takes optional options", () => {
  expectTypeOf(pagination.featureName).toEqualTypeOf<"pagination">();
  expectTypeOf(remotePagination.featureName).toEqualTypeOf<"pagination">();
  pagination();
  remotePagination();
  pagination({ sizes: [10], mode: "offset" });
  // @ts-expect-error: no such mode
  pagination({ mode: "keyset" });
});

it("types initialState.pagination", () => {
  expectTypeOf<StateOf<typeof client>["pagination"]>().toEqualTypeOf<PaginationState>();
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns,
    features: [remotePagination()],
    initialState: { pagination: { pageIndex: 0, pageSize: 10, cursor: null } },
  });
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns,
    features: [pagination()],
    // @ts-expect-error: pageSize is a number
    initialState: { pagination: { pageIndex: 0, pageSize: "10" } },
  });
});

it("puts pagination in the request only for remotePagination", () => {
  expectTypeOf<RequestOf<typeof server>>().toEqualTypeOf<{
    readonly filtering: { query: string };
    readonly pagination: PaginationRequest;
  }>();
  expectTypeOf<RequestOf<typeof client>>().toEqualTypeOf<{ readonly sorting: { sort: string[] } }>();
});

it("gives both features the same API", () => {
  const a = createTableStore(client);
  const b = createTableStore(server);
  expectTypeOf(a.pagination).toEqualTypeOf<PaginationApi>();
  expectTypeOf(b.pagination).toEqualTypeOf<PaginationApi>();
  expectTypeOf(a.pagination.setPage).toEqualTypeOf<PaginationApi["setPage"]>();
  a.pagination.setPageSize((prev) => prev * 2);
});

const fromClient = (host: FeatureHost) => (hasFeature(host, pagination) ? host.pagination : undefined);
const fromServer = (host: FeatureHost) => (hasFeature(host, remotePagination) ? host.pagination : undefined);

it("narrows with hasFeature for either factory", () => {
  expectTypeOf(fromClient).returns.toEqualTypeOf<PaginationApi | undefined>();
  expectTypeOf(fromServer).returns.toEqualTypeOf<PaginationApi | undefined>();
});

it("fits a generic table of fewer features", () => {
  type Client = ReturnType<typeof pagination>;
  type Server = ReturnType<typeof remotePagination>;
  expectTypeOf(createTableStore(client)).toExtend<Table<User, readonly [Client]>>();
  expectTypeOf(createTableStore(server)).toExtend<Table<User, readonly [Server]>>();
});

it("types the pager meta", () => {
  expectTypeOf(computePaginationMeta({ pageIndex: 0, pageSize: 10 }, 0)).toEqualTypeOf<PaginationMeta>();
  expectTypeOf<PaginationMeta["cursor"]>().toEqualTypeOf<string | null | undefined>();
});
