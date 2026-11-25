---
"@lunarhue/table-solid": patch
---

Solid 2 pages now hydrate when a component reads the table. `createTableRows`, `createVisibleColumns` and the other primitives made memos only on the client, and each took a hydration id the server never allocated. Every later sibling then missed its server markup, and Solid rendered that part of the page again into nodes it never attached, with no error. The client-only memos and `createTable`'s options effect are now `transparent`, so they leave the ids alone.
