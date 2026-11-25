import type { ReactNode } from "react";
import { BasicExample } from "./examples/basic.tsx";
import { GeneralExample } from "./examples/general.tsx";
import { MiniBasicExample } from "./examples/mini-basic.tsx";
import { MiniCustomExample } from "./examples/mini-custom.tsx";
import { UrlBoundExample } from "./examples/url-bound.tsx";
import { navigate, useHash } from "./location.ts";

interface View {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly render: () => ReactNode;
}

const views: readonly View[] = [
  {
    id: "basic",
    title: "Basic",
    summary: "defineTable, useTable and plain columns. No custom cells.",
    render: () => <BasicExample />,
  },
  {
    id: "general",
    title: "Data table",
    summary: "Custom cells, headers and footers with sorting, filters, pages, selection and column layout.",
    render: () => <GeneralExample />,
  },
  {
    id: "url",
    title: "URL state",
    summary: "The address bar owns sort, filters and page. The table owns selection and layout.",
    render: () => <UrlBoundExample />,
  },
  {
    id: "mini-basic",
    title: "Mini: basic",
    summary: "useSimpleTable from @lunarhue/table-react/mini with plain columns.",
    render: () => <MiniBasicExample />,
  },
  {
    id: "mini-custom",
    title: "Mini: custom cells",
    summary: "useSimpleTable with badges, formatted values, selection and inline actions.",
    render: () => <MiniCustomExample />,
  },
];

/** The view a hash such as `#general/INV-1001` names. */
const viewOf = (hash: string): View => {
  const id = hash.slice(1).split("/")[0];
  return views.find((view) => view.id === id) ?? views[0] ?? fail();
};

const fail = (): never => {
  throw new Error("No views.");
};

export function App() {
  const view = viewOf(useHash());
  return (
    <div className="shell">
      <aside className="sidebar">
        <p className="brand">
          <strong>@lunarhue/table</strong>
          <span>React examples</span>
        </p>
        <nav aria-label="Examples">
          {views.map((entry) => (
            <a
              key={entry.id}
              href={`#${entry.id}`}
              aria-current={entry.id === view.id ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                // Drop the URL example's query string when leaving it.
                navigate(`${window.location.pathname}#${entry.id}`);
              }}
            >
              {entry.title}
            </a>
          ))}
        </nav>
      </aside>
      <main className="content">
        <header className="page-header">
          <h1>{view.title}</h1>
          <p>{view.summary}</p>
        </header>
        {view.render()}
      </main>
    </div>
  );
}
