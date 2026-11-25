# Contributing

Thanks for looking. This is a small project with a few firm habits, and they
are all written down here. What CI enforces is marked as such.

## Setup

You need [Bun](https://bun.sh) at the version in `package.json`'s
`packageManager` field and Node at the version in `.node-version`. With Nix,
`nix develop` gives you both.

```sh
bun install
```

Packages read each other from source, so you never build before you test.

## The checks

Six checks run on every pull request. Run them from the repo root before you
push.

```sh
bun run typecheck
bun run lint
bun run test
bun run build
bun run check:package
bun run size
```

`check:package` and `size` read the build output, so run them after `build`.
A pull request that changes only docs (Markdown, licenses, changesets and
issue templates) skips them in CI.

## How work lands

1. **Open an issue first.** Say what is wrong or missing and what done looks
   like. For a bug, a failing test or a small reproduction is the best
   description there is. Typos and one-line fixes can skip this.
2. **One pull request per issue**, against `main`, with `Closes #<issue>` in
   the description.
3. **Small commits**, one logical change each, with a short imperative subject:
   "Keep the sort when a column hides", not "fixes" or "Updated sort.ts".
4. **Add a changeset** if your change reaches a published package. See below.

A pull request merges when the checks pass and a maintainer has read it.

## Changesets

Every pull request that changes what a published package ships needs a
changeset. CI fails without one.

```sh
bun run changeset
```

Pick the packages you changed and write one or two sentences for the people
who use the library. Say what changed for them, not what you did to the code.

- **patch**: a fix, or anything that changes no one's code.
- **minor**: a breaking change or a new feature. Until 1.0 a minor may break.

The published packages share one version, so the bump you pick applies to all
of them at release.

A change no user can see, such as a refactor, a test or a comment, needs no
changeset. Ask a maintainer to add the `no-changeset` label and the check
passes.

## Releases

Maintainers do these, by hand for now.

1. Each merge to `main` updates a "Version Packages" pull request. It collects
   the pending changesets, bumps the versions and writes the changelogs. Merge
   it when you want a release.
2. Wait for CI on `main`. Then, on an up-to-date `main`, log in to npm and
   publish:

   ```sh
   npm login
   bun run release
   git push --follow-tags
   ```

`bun run release` builds, packs each package and publishes the tarballs in
dependency order. It skips versions already on npm, so it is safe to run again
after a failure. Never run `npm publish` inside a package folder. That ships
`workspace:` versions nobody can install.

To see what would ship without publishing, pack into an empty folder:

```sh
bun run release:pack --out-dir /tmp/table-pack --dry-run
```

## Size

Each entry point has a limit in its package's `size-limit` list, and
`bun run size` fails when an entry goes over.

- A feature should cost nothing for people who don't use it. Put it in its own
  entry point before you put it in core.
- A limit is a guard against broken tree-shaking or accidental bloat, not a
  budget to chase byte-by-byte. Keep limits at round `0.5 kB` or `1 kB` steps
  with generous headroom (roughly 30–35% on full entries and at least `1 kB`–`1.5 kB`
  on small feature entries) so normal fixes and support don't churn CI. If a
  legitimate feature needs more room, raise the limit in the same pull request
  and say by how much and why.
- Readable code wins over a few bytes. Don't golf core to stay under.

## Code style

oxlint enforces most of it. The rest:

- TypeScript in strict mode. No `any`, and no cast where a type guard works.
- Write code that reads at a glance. `while (true)`, not `for (;;)`.
- Component props are a named interface, destructured in the signature. In
  Solid, don't destructure props, since that drops reactivity.
- No higher-order components. Share adapter code as plain functions and plain
  components.
- Comments say why, not what.

## Tests

- Unit tests sit next to the file they test as `*.test.ts`. Type tests are
  `*.test-d.ts`.
- React tests are `*.test.tsx`, run in jsdom under StrictMode, and go through
  the React Compiler with `panicThreshold: "all_errors"`, so a component the
  Compiler gives up on fails the run.
- A bug fix comes with a regression test that fails without the fix.

## React versions

`@lunarhue/table-react` imports the React hooks that changed in 18 from
`#lunarhue/react`. By default that resolves to `src/react18.ts`, React's own
hooks. An app on React 16.8 or 17 resolves with the `@lunarhue/react-legacy`
condition and gets `src/legacy.ts`, which falls back where React lacks a hook.
Import those hooks from `#lunarhue/react`, never from `react` directly.

## Security

Don't open a public issue for a vulnerability. [SECURITY.md](SECURITY.md)
says how to report one.
