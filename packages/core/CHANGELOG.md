# @lunarhue/table-core

## 0.1.1

### Patch Changes

- [#46](https://github.com/LunarHUE/table/pull/46) [`a43ab11`](https://github.com/LunarHUE/table/commit/a43ab1162406e185edf335881f47a6084bbe2784) Thanks [@tristendillon](https://github.com/tristendillon)! - `columnLayout.moveColumn(id, toIndex)` now reads `toIndex` as a position among the shown columns, start zone through end zone, so a column dropped next to a pinned column lands where it was dropped. A column stays in its zone, and an index outside the zone clamps to the zone's edge. Hidden columns don't count toward the index.

- [#50](https://github.com/LunarHUE/table/pull/50) [`753684d`](https://github.com/LunarHUE/table/commit/753684dc9968f94474644671cb4af6c0dd624ab8) Thanks [@tristendillon](https://github.com/tristendillon)! - When an owner the table doesn't control changes a filter or sort itself, such as the URL on a link or the back button, the table now answers as it does its own write: an "all matching" selection clears and pagination goes back to the first page. Slices the same owner holds keep the values it set, and the table writes nothing back to it.

- [#51](https://github.com/LunarHUE/table/pull/51) [`60e3656`](https://github.com/LunarHUE/table/commit/60e3656517cbb16f3cb96c09d73fcc0bc8f1244c) Thanks [@tristendillon](https://github.com/tristendillon)! - Client `pagination()` no longer strands the table on an empty page when `data` shrinks. A page past the last one shows the last page's rows, and `usePagination` and `createPagination` report that page, so "Page 10 of 2" now reads "Page 2 of 2" and previous goes to page 1. `remotePagination()` keeps the requested page as before, so a page from the URL survives until the server's count arrives. Core adds `clampPageIndex` and `stepPage`, and `computePaginationMeta` takes a `clamp` flag.

- [#49](https://github.com/LunarHUE/table/pull/49) [`dbad4c5`](https://github.com/LunarHUE/table/commit/dbad4c59a520fb1d8432256ecc892de849be8a22) Thanks [@tristendillon](https://github.com/tristendillon)! - Client `pagination()` now fills a page with data rows only. Detail rows stay on the page of the row they belong to and don't take a slot, so expanding a row no longer pushes rows onto the next page or splits a row from its details. `matchingCount`, and `totalCount` and `pageCount` with it, count data rows only, so expanding rows no longer changes them.
