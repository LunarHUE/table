# @lunarhue/table-solid

## 0.1.1

### Patch Changes

- [#47](https://github.com/LunarHUE/table/pull/47) [`5065c81`](https://github.com/LunarHUE/table/commit/5065c81de5600cc5ccc8d7e69d22a40889c76eb8) Thanks [@tristendillon](https://github.com/tristendillon)! - The adapters' declarations now import `@lunarhue/table-core` instead of carrying their own copy of its types. A `StateAdapter` from core's `defineStateAdapter` now fits `useTableBinding` and `createTableBinding`, and `TableDef`, `TableStore`, `ExternalBinding` and the rest are the same types whichever package you import them from.

- [#51](https://github.com/LunarHUE/table/pull/51) [`60e3656`](https://github.com/LunarHUE/table/commit/60e3656517cbb16f3cb96c09d73fcc0bc8f1244c) Thanks [@tristendillon](https://github.com/tristendillon)! - Client `pagination()` no longer strands the table on an empty page when `data` shrinks. A page past the last one shows the last page's rows, and `usePagination` and `createPagination` report that page, so "Page 10 of 2" now reads "Page 2 of 2" and previous goes to page 1. `remotePagination()` keeps the requested page as before, so a page from the URL survives until the server's count arrives. Core adds `clampPageIndex` and `stepPage`, and `computePaginationMeta` takes a `clamp` flag.

- [#52](https://github.com/LunarHUE/table/pull/52) [`43ba0f7`](https://github.com/LunarHUE/table/commit/43ba0f78ab2d29a8f6a90c52ddbafa2c3d24a2bb) Thanks [@tristendillon](https://github.com/tristendillon)! - Solid 2 pages now hydrate when a component reads the table. `createTableRows`, `createVisibleColumns` and the other primitives made memos only on the client, and each took a hydration id the server never allocated. Every later sibling then missed its server markup, and Solid rendered that part of the page again into nodes it never attached, with no error. The client-only memos and `createTable`'s options effect are now `transparent`, so they leave the ids alone.
- Updated dependencies [[`a43ab11`](https://github.com/LunarHUE/table/commit/a43ab1162406e185edf335881f47a6084bbe2784), [`753684d`](https://github.com/LunarHUE/table/commit/753684dc9968f94474644671cb4af6c0dd624ab8), [`60e3656`](https://github.com/LunarHUE/table/commit/60e3656517cbb16f3cb96c09d73fcc0bc8f1244c), [`dbad4c5`](https://github.com/LunarHUE/table/commit/dbad4c59a520fb1d8432256ecc892de849be8a22)]:
  - @lunarhue/table-core@0.1.1
