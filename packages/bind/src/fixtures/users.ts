import { defineTable, remoteFiltering, remotePagination, remoteSorting, type StateOf } from "@lunarhue/table-core";
import { defineTableUrl, enumParam, pageCodec, sortCodec, stringParam } from "@lunarhue/table-core/url";

// One table and its URL, shared by the binding tests.

export interface User {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface Filters {
  search?: string;
  role?: "admin" | "member";
}

export const usersTable = defineTable<User>()({
  getRowId: (row) => row.id,
  columns: [
    { id: "name", sortable: true, getValue: (row: User) => row.name },
    { id: "createdAt", sortable: true, getValue: (row: User) => row.createdAt },
  ],
  features: [remoteSorting(), remotePagination({ sizes: [10, 25, 50] }), remoteFiltering<Filters>()],
  initialState: { filtering: { search: "" } },
});

export const usersUrl = defineTableUrl(usersTable, {
  sorting: sortCodec(),
  pagination: pageCodec(),
  filtering: { search: stringParam(), role: enumParam(["admin", "member"]) },
});

export type UsersState = StateOf<typeof usersTable>;
