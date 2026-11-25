---
"@lunarhue/table-react": patch
"@lunarhue/table-solid": patch
---

The adapters' declarations now import `@lunarhue/table-core` instead of carrying their own copy of its types. A `StateAdapter` from core's `defineStateAdapter` now fits `useTableBinding` and `createTableBinding`, and `TableDef`, `TableStore`, `ExternalBinding` and the rest are the same types whichever package you import them from.
