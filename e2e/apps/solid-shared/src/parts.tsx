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
  createColumnState,
  type PaginationControls,
  type Row,
  type SortingApi,
  type Table,
} from "@lunarhue/table-solid";
import { type Accessor, createSignal, For, onSettled } from "solid-js";

/** What every page gets from the app. */
export interface PageProps {
  /** The request's query string on the server, `location.search` in the browser. */
  readonly search: string;
}

interface RendersProps {
  readonly id: string;
}

/**
 * A render counter. Its ref runs once each time the element is made, which
 * is each time the component around it runs. On the server refs don't run,
 * so the server HTML has no count.
 */
export function Renders(props: RendersProps) {
  return (
    <output
      ref={(element) => {
        element.textContent = String(countRender(props.id));
      }}
      data-testid={testIds.renders(props.id)}
      aria-hidden="true"
    />
  );
}

interface ProbeProps {
  readonly table: ProbeTable;
  readonly sources?: Readonly<Record<string, ProbeSource>>;
}

/** The state probe, started once the page has hydrated. */
export function Probe(props: ProbeProps) {
  let element: HTMLPreElement | undefined;
  onSettled(() => (element ? startProbe(element, props.table, props.sources) : undefined));
  return (
    <pre
      ref={(pre) => {
        element = pre;
      }}
      data-testid={testIds.probe}
    />
  );
}

/**
 * The page's location and the query string now, following pushes and the
 * browser's back and forward once the page has hydrated.
 */
export function createSearch(search: string): { readonly location: PageLocation; readonly current: Accessor<string> } {
  const location = createLocation(search);
  const [current, setCurrent] = createSignal(location.read());
  onSettled(() => {
    const update = (): void => {
      setCurrent(location.read());
    };
    update();
    return location.subscribe(update);
  });
  return { location, current };
}

/** A column's header label. */
export const labelOf = (column: ColumnViewInfo): string => column.label ?? column.id;

interface DataCellsProps<TRow> {
  readonly table: Table<TRow>;
  readonly row: Row<TRow>;
  readonly columns: readonly ColumnView<TRow>[];
}

/** One `<td>` per shown column, each marked with its column's id. */
export function DataCells<TRow>(props: DataCellsProps<TRow>) {
  return (
    <For each={props.columns}>
      {(column) => (
        <td data-col={column.id}>
          <Cell table={props.table} row={props.row} column={column} />
        </td>
      )}
    </For>
  );
}

interface PlainHeaderProps {
  readonly column: ColumnViewInfo;
}

/** A header that doesn't sort. */
export function PlainHeader(props: PlainHeaderProps) {
  return (
    <th data-col={props.column.id}>
      <span class="label">{labelOf(props.column)}</span>
    </th>
  );
}

interface SortHeaderProps {
  readonly table: AnyTable & { readonly sorting: SortingApi };
  readonly column: ColumnViewInfo;
}

/**
 * A header that sorts on click, and by one more column on shift-click. It
 * reads only its own column's sort, so sorting another column leaves it be.
 */
export function SortHeader(props: SortHeaderProps) {
  const dir = createColumnState(props.table, props.column.id, "sorting", sortDirOf);
  if (props.column.sortable !== true) return <PlainHeader column={props.column} />;
  return (
    <th data-col={props.column.id} aria-sort={ariaSortOf(dir())}>
      <button type="button" onClick={(event) => props.table.sorting.toggle(props.column.id, { multi: event.shiftKey })}>
        <span class="label">{labelOf(props.column)}</span>
      </button>
      <Renders id={`header-${props.column.id}`} />
    </th>
  );
}

interface PagerProps {
  readonly pager: PaginationControls;
  readonly text: string;
}

/** The page line, the previous and next buttons, and the page size. */
export function Pager(props: PagerProps) {
  return (
    <div class="controls">
      <button type="button" onClick={() => props.pager.prev()} disabled={!props.pager.canPrev}>
        Previous
      </button>
      <span data-testid="pager">{props.text}</span>
      <button type="button" onClick={() => props.pager.next()} disabled={!props.pager.canNext}>
        Next
      </button>
      <label>
        Rows per page{" "}
        <select value={String(props.pager.pageSize)} onChange={(event) => props.pager.setPageSize(Number(event.currentTarget.value))}>
          <For each={props.pager.sizes}>{(size) => <option value={String(size)}>{size}</option>}</For>
        </select>
      </label>
    </div>
  );
}
