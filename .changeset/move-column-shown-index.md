---
"@lunarhue/table-core": patch
---

`columnLayout.moveColumn(id, toIndex)` now reads `toIndex` as a position among the shown columns, start zone through end zone, so a column dropped next to a pinned column lands where it was dropped. A column stays in its zone, and an index outside the zone clamps to the zone's edge. Hidden columns don't count toward the index.
