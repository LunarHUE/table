// The entry a React Server Component graph resolves to, through the
// `react-server` export condition: core's definition helpers and
// `defineCell`, with no hooks, so a server component can import
// `defineTable` from the package without pulling in client code.
export * from "@lunarhue/table-core";
export { defineCell, type CellApi, type FooterApi, type HeaderApi, type NoPartApi } from "./define-cell.js";
