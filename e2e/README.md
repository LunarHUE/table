# End-to-end suite

One Playwright suite that both adapters must pass, on every framework major
they support. Each framework has one shared app that renders the same tables,
server-renders them and hydrates them. Each major builds that app against its
own copy of the framework. The same spec files run against every major, one
Playwright project each: `react16`, `react17`, `react18`, `react19` and
`solid2`. A spec that passes on React 19 and fails on Solid 2 or React 17 is a
bug in an adapter or in core.

The suite is private (`@lunarhue/table-e2e`) and isn't one of the root checks.

## Running it

From the repo root:

```sh
bun run e2e                                # every major
bun run e2e:changed                        # majors the changes since origin/main reach
bun run e2e:changed --base <ref>           # ... since another ref
bun run e2e:changed --framework react17    # only the majors named, repeatable
bun run e2e:changed --newest               # only react19 and solid2, combinable with the rest
bun run e2e:changed --dry-run              # print the choice and why, run nothing
bun run e2e -- -- --grep sorting           # anything after the second -- goes to Playwright
```

Playwright needs Chromium once: `bunx playwright install chromium` in `e2e`.

Every major runs in Chromium. Set `E2E_BROWSER` to `firefox` or `webkit` to
run in that browser instead, after installing it the same way:

```sh
E2E_BROWSER=firefox bun run e2e --newest
```

Each run builds the apps it needs once, in production mode, and starts one
server per major on the port in `contract/frameworks.ts`. Playwright stops
them when the run ends. Specs run in parallel.

When a run ends, the list reporter is followed by every skipped spec and why
it was skipped (see [Capabilities](#capabilities)).

## The matrix in CI

CI runs one job per browser: `e2e (chromium)`, `e2e (firefox)` and
`e2e (webkit)`.

| Run | Chromium | Firefox and WebKit |
| --- | --- | --- |
| Pull request | every major the changes reach | `react19` and `solid2`, if the changes reach them |
| Push to `main` | every major | `react19` and `solid2` |
| Weekly, and manual runs | every major | every major |

Older majors break on framework changes, and Chromium catches those. Browser
differences rarely depend on the framework's major, so Firefox and WebKit run
the newest major of each framework, marked `newest` in
`contract/frameworks.ts`, and the weekly run does the full grid. The weekly
run also catches a new browser build that breaks something when no code
changed. The Version Packages pull request skips the suite, since `main`
already ran it on the same source.

Run Playwright directly from `e2e` only with
`NODE_OPTIONS=--conditions=@lunarhue/source`, since the specs import the
contract and the contract imports the library from source. `run.ts` sets it.

## How `e2e:changed` picks

It lists the files changed against the base (committed, uncommitted and
untracked), then:

- Docs (Markdown anywhere, changesets, `LICENSE`, issue templates) count for
  nothing. Docs alone run nothing. CI uses the same rule to skip its checks on
  a docs-only change.
- A file outside every workspace package, such as root config or `bun.lock`,
  runs every framework.
- A file inside a package runs every major whose app depends on that package,
  directly or through others. The graph comes from the workspace
  `package.json` files. Each major's package depends on its framework's
  shared app, so a change to the React adapter or to `apps/react-shared` runs
  every React major, and a change to `apps/react17` runs only `react17`.
  Every app depends on this package, so a change to the specs, the contract
  or the server runs everything, and so does a change to core, which the
  contract uses.

It prints one line per major saying why it runs or why it was skipped.
`--newest` then drops every major that isn't the newest, and says which. The
decision is `changed/pick.ts`, a pure function with its own unit tests, which
run in the root `test`.

## Layout

- `contract/`: everything apps and specs share, with no framework code. The
  scenario list, each scenario's table definition, data, labels and expected
  server HTML (`contract/scenarios/*.ts`), the fake URL (`location.ts`), the
  state probe, the render counters and the list of framework majors with what
  each one is expected to do.
- `apps/react-shared`, `apps/solid-shared`: each framework's shared app,
  never built or run on its own. `src/parts.tsx` has the probe, the render
  counter, the headers, cells and pager every page uses. `src/pages/*.tsx`
  has one page per scenario. `src/app.tsx` exports `App`, the page for a
  path.
- `apps/react16` to `apps/react19`, `apps/solid2`: one thin package per
  major. Its `package.json` installs that major (React 16 to 18 come from the
  root `react16`, `react17` and `react18` catalogs, the newest from the
  default catalog). Its `src/entry-server.tsx` and `src/entry-client.tsx`
  render and hydrate the shared `App` with that major's API: React 16 and 17
  hydrate with `ReactDOM.hydrate`, React 18 and 19 with `hydrateRoot`. Its
  `vite.config.ts` builds it.
- `server.ts`: the one server every app runs on. It imports the app's built
  server entry, wraps the markup in the same document and serves the client
  build. The query string goes to the app, so a page bound to the URL renders
  its state on the server.
- `vite.base.ts`: the Vite config every major shares, and `pinFramework`,
  which makes the shared app, the adapter and the renderer all import the
  major's own copy of the framework instead of the workspace's newest. React
  16.8 ships no JSX runtime, so `apps/react16` points the JSX at its own
  `src/jsx-runtime.ts`. `apps/react16` and `apps/react17` also resolve with
  the `@lunarhue/react-legacy` condition through `withCondition`, as a React
  16.8 or 17 app must, so the adapter takes its fallback hooks.
- `specs/`: the Playwright specs. They find things through the contract only:
  roles, labels and test ids.
- `skips.ts`: the reporter that lists skipped specs with their reasons.
- `changed/` and `run.ts`: the changed-files command.

Every page has a state probe, `data-testid="probe"`, that holds JSON once the
page is live: the table's whole state, feature by feature, and what any extra
source holds, such as the fake URL's search string and how many times the
table wrote it. Specs read it with `probe(page)` and `locationProbe(page)`.
Components that should stay put have a render counter,
`data-testid="renders-<id>"`. React counts each render. Solid components run
once, so most of its counters stay at 1, and the contract's
`rerendersOnChange` says which a framework does.

## Adding a scenario

1. Add `contract/scenarios/<id>.ts`: start it with `scenario("<id>", title,
   serverView)`, then its table definition, data and anything its pages
   share. Add it to the list in `contract/scenarios.ts` and export it from
   `contract/index.ts`.
2. Add `src/pages/<id>.tsx` to each shared app (`apps/react-shared`,
   `apps/solid-shared`) and put it in that app's `pages` in `src/app.tsx`.
   Until every app has it, `typecheck` fails.
3. Add `specs/<id>.spec.ts`. The server spec already checks the new page's
   server HTML and hydration from its server view.

## Adding a major

Say Solid 1, as `solid1`:

1. If the major needs a version the workspace doesn't install, add a named
   catalog for it to the root `package.json`, the way `react16` to `react18`
   are.
2. Add `apps/solid1`, a copy of `apps/solid2`: a `package.json` named
   `@lunarhue/table-e2e-solid1` that depends on `@lunarhue/table-e2e`,
   `@lunarhue/table-e2e-solid-shared` and the framework from that catalog, a
   `tsconfig.json`, a `vite.config.ts` that passes `pinFramework` the
   framework's module names, and the two entries. Where the major's API
   differs, the entries and the Vite config absorb it. `pinFramework`'s second
   argument sends an import to another module or to a file, as `apps/react16`
   does for its JSX runtime. Whatever the shared app uses that the major
   can't provide that way needs a branch in the shared app.
3. Add an entry to `frameworks` in `contract/frameworks.ts`: its name, a free
   port, whether it is the newest major of its framework, whether its
   components run again on a change, and the capabilities it lacks.
4. Run `bun install`, then `bun run e2e:changed --framework solid1`.

No spec changes. `e2e:changed` finds the new package through its
`package.json`, and the picker's tests read the list in
`contract/frameworks.ts`.

## Capabilities

Some specs need something not every major has. Each such need is a
`Capability` in `contract/frameworks.ts`. A major lists the ones it lacks in
`lacks`, each with the reason, and a spec that needs one calls
`requires(framework, "<capability>")` first. On a major that lacks it the
spec is skipped, and the reason shows in the run's list of skips.

| Capability | Lacked by | Why |
| --- | --- | --- |
| `a11yHelpers` | `solid2` | `useRowLink` and `useRovingTabIndex` live in `@lunarhue/table-react/a11y`. The Solid adapter has no a11y entry. |
| `generatedIds` | `react16`, `react17` | React before 18 has no `useId`. The adapter's fallback counts ids on each side, so the server's ids and the client's differ, and the roving grid's keys spec skips. |

Use a capability for something the major can't do. A spec that should pass
and doesn't is a known failure, below.

## When a spec fails on one major

Don't change a spec to hide it. Add it to that major's `knownFailures` in
`contract/frameworks.ts`, keyed `<spec file> > <describe> > <title>`, with a
note on what differs. It then runs as an expected failure, and turns red once
the adapter is fixed, so the entry can go.

When it fails in one browser only, use `knownFailuresIn` instead, keyed by
the browser first. The spec still has to pass in the other browsers.
