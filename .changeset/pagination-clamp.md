---
"@lunarhue/table-core": patch
"@lunarhue/table-react": patch
"@lunarhue/table-solid": patch
---

Client `pagination()` no longer strands the table on an empty page when `data` shrinks. A page past the last one shows the last page's rows, and `usePagination` and `createPagination` report that page, so "Page 10 of 2" now reads "Page 2 of 2" and previous goes to page 1. `remotePagination()` keeps the requested page as before, so a page from the URL survives until the server's count arrives. Core adds `clampPageIndex` and `stepPage`, and `computePaginationMeta` takes a `clamp` flag.
