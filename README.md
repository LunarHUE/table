# @lunarhue/table

Headless tables for React and Solid, built on one framework-free core.

## Packages

| Package | Entries | What it is for |
| --- | --- | --- |
| `@lunarhue/table-core` | `.` | Framework-free table definitions, features (`sorting`, `filtering`, `pagination`, `selection`, `visibility`, `columnLayout`), and state-adapter primitives (`defineStateAdapter`, `resolveTableState`, `bindGroup`) |
| `@lunarhue/table-react` | `.`, `./a11y`, `./mini`, `./legacy` | React adapter (React Compiler native, RSC-safe `react-server` entry, `./a11y` helpers, `./mini` `useSimpleTable`, and React 16.8/17 support via `@lunarhue/react-legacy`) |
| `@lunarhue/table-solid` | `.` | Solid 2 adapter |

The three packages share one version.

## Repo scripts

Run from the repo root with `bun run <script>`:

- `typecheck` runs `tsc` over the root configs, every package and `scripts/`.
  Packages read each other from source, so nothing needs building first.
- `lint` runs oxlint with type-aware rules, plus the React Compiler rules for
  `packages/react`.
- `test` runs the Vitest unit tests and the `*.test-d.ts` type tests. The React
  package's tests run through the React Compiler.
- `build` writes ESM to `dist/esm`, CJS to `dist/cjs` and the `.d.ts` files
  beside them.
- `check:package` runs `publint` and `arethetypeswrong` on each packed
  package. Needs `build`.
- `size` checks each entry against its `size-limit`. Needs `build`.
- `changeset` adds a changeset. `version` and `release` are for maintainers.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup, the checks, changesets and
releases. Report security issues as [SECURITY.md](SECURITY.md) says.

## License

MIT
