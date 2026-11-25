import { indexTitle, type Pages, scenarioAt, scenarios } from "@lunarhue/table-e2e/contract";
import { Dynamic } from "@solidjs/web";
import { type Component, For, Show } from "solid-js";
import { A11yPage } from "./pages/a11y.js";
import { ColumnsPage } from "./pages/columns.js";
import { DetailRowsPage } from "./pages/detail-rows.js";
import { FilteringPage } from "./pages/filtering.js";
import { PaginationPage } from "./pages/pagination.js";
import { SelectionPage } from "./pages/selection.js";
import { SortingPage } from "./pages/sorting.js";
import { UrlStatePage } from "./pages/url-state.js";
import type { PageProps } from "./parts.js";

const pages: Pages<Component<PageProps>> = {
  sorting: SortingPage,
  filtering: FilteringPage,
  pagination: PaginationPage,
  "detail-rows": DetailRowsPage,
  selection: SelectionPage,
  columns: ColumnsPage,
  "url-state": UrlStatePage,
  a11y: A11yPage,
};

interface AppProps {
  readonly path: string;
  /** The query string, with its `?`. */
  readonly search: string;
}

/** The page for `path`: a scenario, or the index of them all. */
export function App(props: AppProps) {
  return (
    <Show
      when={scenarioAt(props.path)}
      fallback={
        <main>
          <h1>{indexTitle}</h1>
          <ul>
            <For each={scenarios}>
              {(entry) => (
                <li>
                  <a href={entry.route}>{entry.title}</a>
                </li>
              )}
            </For>
          </ul>
        </main>
      }
    >
      {(scenario) => (
        <main>
          <h1>{scenario().title}</h1>
          <Dynamic component={pages[scenario().id]} search={props.search} />
        </main>
      )}
    </Show>
  );
}
