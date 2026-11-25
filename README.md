# @lunarhue/table

Headless tables for React and Solid, built on one framework-free core.

This repo is at its starting point. The packages below exist, build and
publish, but each exports only a placeholder until the table model lands.

## Packages

| Package | Entries | What it is for |
| --- | --- | --- |
| `@lunarhue/table-core` | `.`, `./url` | The framework-free table model, and table state in a query string (`./url`) |
| `@lunarhue/table-react` | `.`, `./a11y`, `./mini`, `./legacy` | React adapter. React 18+ by default, 16.8 and 17 through the `@lunarhue/react-legacy` condition |
| `@lunarhue/table-solid` | `.` | Solid 2 adapter |
| `@lunarhue/table-bind` | `./nuqs`, `./zustand`, `./solid` | Keep table state in nuqs, a Zustand store or a Solid signal |

The four packages share one version.

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

## Working on it in a LunarHUE workspace

The repo is checked out at `~/repos/table` and runs in its own pod.

- `ws-route table <dir> -- <command>` runs a command in the pod at
  `/workspace/<dir>`, with the dev environment from `flake.nix` loaded.
- `ws run table --name dev --wait-port <port> -- <command>` starts a
  long-running command. `ws ps`, `ws logs table dev` and `ws stop table dev`
  manage it.
- Outside Coder, `.devcontainer/devcontainer.json` opens the repo in the same
  image the pod uses. Run `docker login ghcr.io` first, since the image is
  private.

## License

MIT
