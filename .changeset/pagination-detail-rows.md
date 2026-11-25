---
"@lunarhue/table-core": patch
---

Client `pagination()` now fills a page with data rows only. Detail rows stay on the page of the row they belong to and don't take a slot, so expanding a row no longer pushes rows onto the next page or splits a row from its details. `matchingCount`, and `totalCount` and `pageCount` with it, count data rows only, so expanding rows no longer changes them.
