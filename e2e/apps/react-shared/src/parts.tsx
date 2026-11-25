import {
  ariaSortOf,
  countRender,
  createLocation,
  type PageLocation,
  type ProbeSource,
  type ProbeTable,
  sortDirOf,
  startProbe,
  testIds,
} from "@lunarhue/table-e2e/contract";
import {
  type AnyTable,
  Cell,
  type ColumnView,
  type ColumnViewInfo,
  type PaginationControls,
  type Row,
  type SortingApi,
  type Table,
  useColumnState,
} from "@lunarhue/table-react";
import { memo, useEffect, useRef, useState } from "react";

/** What every page gets from the app. */
export interface PageProps {
  /** The request's query string on the server, `location.search` in the browser. */
  readonly search: string;
}

interface RendersProps {
  readonly id: string;
}

/**
 * A render counter. It has no memo, so it renders each time its parent does,
 * and its effect writes the new count after each commit. React never sees the
 * text, so showing it causes no render of its own.
 */
export function Renders({ id }: RendersProps) {
  const counter = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    if (counter.current) counter.current.textContent = String(countRender(id));
  });
  return <output ref={counter} data-testid={testIds.renders(id)} aria-hidden="true" />;
}

interface ProbeProps {
  readonly table: ProbeTable;
  readonly sources?: Readonly<Record<string, ProbeSource>>;
}

/** The state probe, started once the page has hydrated. */
export function Probe({ table, sources }: ProbeProps) {
  const element = useRef<HTMLPreElement>(null);
  useEffect(() => (element.current ? startProbe(element.current, table, sources) : undefined), [table, sources]);
  return <pre ref={element} data-testid={testIds.probe} />;
}

/** The page's location, made once from the query string the page rendered with. */
export function usePageLocation(search: string): PageLocation {
  const [location] = useState(() => createLocation(search));
  return location;
}

/** The query string now, following pushes and the browser's back and forward. */
export function useSearch(location: PageLocation): string {
  const [search, setSearch] = useState(location.read);
  useEffect(() => {
    const update = (): void => setSearch(location.read());
    update();
    return location.subscribe(update);
  }, [location]);
  return search;
}

/** A column's header label. */
export const labelOf = (column: ColumnViewInfo): string => column.label ?? column.id;

interface DataCellsProps<TRow> {
  readonly table: Table<TRow>;
  readonly row: Row<TRow>;
  readonly columns: readonly ColumnView<TRow>[];
}

/** One `<td>` per shown column, each marked with its column's id. */
export function DataCells<TRow>({ table, row, columns }: DataCellsProps<TRow>) {
  return (
    <>
      {columns.map((column) => (
        <td key={column.id} data-col={column.id}>
          <Cell table={table} row={row} column={column} />
        </td>
      ))}
    </>
  );
}

interface PlainHeaderProps {
  readonly column: ColumnViewInfo;
}

/** A header that doesn't sort. */
export function PlainHeader({ column }: PlainHeaderProps) {
  return (
    <th data-col={column.id}>
      <span className="label">{labelOf(column)}</span>
    </th>
  );
}

interface SortHeaderProps {
  readonly table: AnyTable & { readonly sorting: SortingApi };
  readonly column: ColumnViewInfo;
}

/**
 * A header that sorts on click, and by one more column on shift-click. It
 * reads only its own column's sort, and `memo` keeps its parent's renders
 * out, so sorting another column leaves it be.
 */
export const SortHeader = memo(function SortHeader({ table, column }: SortHeaderProps) {
  const dir = sortDirOf(useColumnState(table, column.id, "sorting"));
  if (column.sortable !== true) return <PlainHeader column={column} />;
  return (
    <th data-col={column.id} aria-sort={ariaSortOf(dir)}>
      <button type="button" onClick={(event) => table.sorting.toggle(column.id, { multi: event.shiftKey })}>
        <span className="label">{labelOf(column)}</span>
      </button>
      <Renders id={`header-${column.id}`} />
    </th>
  );
});

interface PagerProps {
  readonly pager: PaginationControls;
  readonly text: string;
}

/** The page line, the previous and next buttons, and the page size. */
export function Pager({ pager, text }: PagerProps) {
  return (
    <div className="controls">
      <button type="button" onClick={pager.prev} disabled={!pager.canPrev}>
        Previous
      </button>
      <span data-testid="pager">{text}</span>
      <button type="button" onClick={pager.next} disabled={!pager.canNext}>
        Next
      </button>
      <label>
        Rows per page{" "}
        <select value={pager.pageSize} onChange={(event) => pager.setPageSize(Number(event.target.value))}>
          {pager.sizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
