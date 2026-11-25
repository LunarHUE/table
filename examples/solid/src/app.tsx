import { Dynamic } from "@solidjs/web";
import { type Component, createMemo, For } from "solid-js";
import { BasicExample } from "./examples/basic.tsx";
import { CompactExample } from "./examples/compact.tsx";
import { GeneralExample } from "./examples/general.tsx";
import { UrlBoundExample } from "./examples/url-bound.tsx";
import { createLocation, navigate } from "./location.ts";

/** What every view gets from the shell. */
export interface ViewProps {
  /** The query string, with its `?`. */
  readonly search: string;
  /** The hash, with its `#`. */
  readonly hash: string;
}

interface View {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly component: Component<ViewProps>;
}

const views: readonly [View, ...View[]] = [
  {
    id: "basic",
    title: "Basic",
    summary: "defineTable, createTable and plain columns. No custom cells.",
    component: BasicExample,
  },
  {
    id: "general",
    title: "Data table",
    summary: "Custom cells, headers and footers with sorting, filters, pages, selection and column layout.",
    component: GeneralExample,
  },
  {
    id: "url",
    title: "URL state",
    summary: "The address bar owns sort, filters and page. The table owns selection and layout.",
    component: UrlBoundExample,
  },
  {
    id: "compact",
    title: "Compact",
    summary: "Only sorting and filtering, with custom cells. The rest of the library stays out of the bundle.",
    component: CompactExample,
  },
];

/** The view a hash such as `#general/INV-1001` names. */
const viewOf = (hash: string): View => {
  const id = hash.slice(1).split("/")[0];
  return views.find((view) => view.id === id) ?? views[0];
};

export function App() {
  const location = createLocation();
  const view = createMemo(() => viewOf(location.hash()));
  return (
    <div class="shell">
      <aside class="sidebar">
        <p class="brand">
          <strong>@lunarhue/table</strong>
          <span>Solid examples</span>
        </p>
        <nav aria-label="Examples">
          <For each={views}>
            {(entry) => (
              <a
                href={`#${entry.id}`}
                aria-current={entry.id === view().id ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  // Drop the URL example's query string when leaving it.
                  navigate(`${window.location.pathname}#${entry.id}`);
                }}
              >
                {entry.title}
              </a>
            )}
          </For>
        </nav>
      </aside>
      <main class="content">
        <header class="page-header">
          <h1>{view().title}</h1>
          <p>{view().summary}</p>
        </header>
        <Dynamic component={view().component} search={location.search()} hash={location.hash()} />
      </main>
    </div>
  );
}
