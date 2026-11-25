---
"@lunarhue/table-core": patch
---

When an owner the table doesn't control changes a filter or sort itself, such as the URL on a link or the back button, the table now answers as it does its own write: an "all matching" selection clears and pagination goes back to the first page. Slices the same owner holds keep the values it set, and the table writes nothing back to it.
