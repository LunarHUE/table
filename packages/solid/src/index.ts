// The Solid 2 adapter. Each primitive mirrors one store snapshot in a
// signal for the life of its owner, so a write wakes only the readers of
// what it changed. Core's definitions, features and helpers are re-exported,
// so an app imports everything from this package.

export * from "@lunarhue/table-core";
export type { AnyTable, FeatureKey, Key } from "./store.js";
export {
  createAllColumns,
  createCellState,
  createColumnState,
  createFeatureState,
  createHeaderGroups,
  createRowState,
  createTable,
  createTableMeta,
  createTableRequest,
  createTableRows,
  createVisibleColumns,
  type CreateTableOptions,
  type RowsOptions,
} from "./table.js";
export {
  createIsFiltered,
  createPagination,
  createSelectAll,
  createSelection,
  type PaginationControls,
  type PaginationTable,
  type SelectAllControls,
  type SelectAllOptions,
  type SelectionTable,
} from "./controls.js";
export {
  Cell,
  defineCell,
  Footer,
  Header,
  type CellApi,
  type CellProps,
  type FooterApi,
  type FooterProps,
  type HeaderApi,
  type HeaderProps,
} from "./cell.js";
