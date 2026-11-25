import type { AnyColumn } from "./column.js";
import type { ColumnViewInfo, ColumnZone } from "./contract.js";

// The column pipeline: drop the columns the app omits, run every feature's
// column stage, then split the shown columns into zones and work out the
// header rows. It reads no state itself; the store hands it the stages with
// their state bound.

/** A column as the table shows it, with the column it came from. */
export interface ColumnView<TRow = unknown> extends ColumnViewInfo {
  readonly column: AnyColumn<TRow>;
}

/**
 * One cell in a header row. A cell over a column has `columnId` and
 * `column`; a group cell has neither, and `group` names its group.
 */
export interface HeaderCell<TRow = unknown> {
  /** Unique among the table's header cells. */
  readonly id: string;
  readonly columnId: string | undefined;
  readonly group: string | undefined;
  /** The column's label or id, or the group's id. */
  readonly label: string;
  readonly colSpan: number;
  readonly rowSpan: number;
  /** The header row the cell sits in, from 0. */
  readonly depth: number;
  /**
   * True for a slot that a cell above covers with its `rowSpan`. An HTML
   * table skips it; a grid that lays out every slot draws it empty.
   */
  readonly isPlaceholder: boolean;
  readonly column: ColumnView<TRow> | undefined;
}

/** One header row. The `colSpan`s of its cells add up to the number of shown columns. */
export interface HeaderGroup<TRow = unknown> {
  readonly id: string;
  readonly depth: number;
  readonly headers: readonly HeaderCell<TRow>[];
}

/** What the column pipeline returns. */
export interface ColumnPipelineResult<TRow> {
  /** Every column the app didn't omit, shown or hidden, in stage order, as a view menu lists them. Hidden ones have `order: -1`. */
  readonly allColumns: readonly ColumnView<TRow>[];
  /** The shown columns: start zone, then center, then end, with `order` counting from 0. */
  readonly visibleColumns: readonly ColumnView<TRow>[];
  readonly zones: {
    readonly start: readonly ColumnView<TRow>[];
    readonly center: readonly ColumnView<TRow>[];
    readonly end: readonly ColumnView<TRow>[];
  };
  readonly headerGroups: readonly HeaderGroup<TRow>[];
}

/** A feature's column stage with its state and options bound. */
export type ColumnStep = (columns: readonly ColumnViewInfo[]) => readonly ColumnViewInfo[];

const ZONES: readonly ColumnZone[] = ["start", "center", "end"];

const cell = <TRow>(
  id: string,
  depth: number,
  view: ColumnView<TRow> | undefined,
  group: string | undefined,
  colSpan: number,
  rowSpan: number,
  isPlaceholder = false,
): HeaderCell<TRow> =>
  Object.freeze({
    id,
    columnId: view?.id,
    group,
    label: view ? (view.label ?? view.id) : (group ?? ""),
    colSpan,
    rowSpan,
    depth,
    isPlaceholder,
    column: view,
  });

/**
 * Works out the header rows from the shown columns' `group`.
 *
 * With no group, there is one row with a cell per column.
 *
 * With any group, there are two rows. Row 0 has one cell per run of
 * neighbouring columns in the same group, spanning the run, and the cell of
 * each ungrouped column with `rowSpan: 2`. Row 1 has the cells of the
 * grouped columns, and a placeholder under each ungrouped column, so both
 * rows cover every column.
 */
export function computeHeaderGroups<TRow>(columns: readonly ColumnView<TRow>[]): readonly HeaderGroup<TRow>[] {
  const row = (depth: number, headers: HeaderCell<TRow>[]): HeaderGroup<TRow> =>
    Object.freeze({ id: `header-${depth}`, depth, headers: Object.freeze(headers) });
  if (!columns.some((view) => view.group !== undefined)) {
    return Object.freeze([row(0, columns.map((view) => cell(view.id, 0, view, undefined, 1, 1)))]);
  }
  const top: HeaderCell<TRow>[] = [];
  const leaves: HeaderCell<TRow>[] = [];
  for (let i = 0; i < columns.length; ) {
    const first = columns[i];
    if (!first) break;
    const { group } = first;
    if (group === undefined) {
      top.push(cell(first.id, 0, first, undefined, 1, 2));
      leaves.push(cell(`${first.id}:placeholder`, 1, first, undefined, 1, 1, true));
      i++;
      continue;
    }
    let span = 0;
    for (let view = columns[i]; view?.group === group; view = columns[++i]) {
      leaves.push(cell(view.id, 1, view, group, 1, 1));
      span++;
    }
    // A group split by a zone or another column shows twice, so the first column names the cell.
    top.push(cell(`${group}:${first.id}`, 0, undefined, group, span, 1));
  }
  return Object.freeze([row(0, top), row(1, leaves)]);
}

/**
 * Runs the column pipeline. `omitColumns` takes columns out before any
 * stage sees them, so no feature can show them again. Stages run in the
 * order given, which is the table's resolved feature order. A stage that
 * returns a column id the table doesn't have, or one twice, loses the extra.
 */
export function computeColumns<TRow>(
  columns: readonly AnyColumn<TRow>[],
  omitColumns: ReadonlySet<string>,
  stages: readonly ColumnStep[],
): ColumnPipelineResult<TRow> {
  const byId = new Map<string, AnyColumn<TRow>>();
  let infos: readonly ColumnViewInfo[] = columns
    .filter((column) => !omitColumns.has(column.id))
    .map((column, order): ColumnViewInfo => {
      byId.set(column.id, column);
      return { ...column, visible: true, zone: "center", order };
    });
  for (const stage of stages) infos = stage(infos);

  const kept: (readonly [ColumnViewInfo, AnyColumn<TRow>])[] = [];
  for (const info of infos) {
    const column = byId.get(info.id);
    if (!column) continue;
    byId.delete(info.id);
    kept.push([info, column]);
  }

  const views = new Map<string, ColumnView<TRow>>();
  const zone = (name: ColumnZone) => kept.filter(([info]) => info.visible && info.zone === name);
  const visibleColumns = Object.freeze(
    ZONES.flatMap(zone).map(([info, column], order) => {
      const view: ColumnView<TRow> = Object.freeze({ ...info, order, column });
      views.set(info.id, view);
      return view;
    }),
  );
  const allColumns = Object.freeze(
    kept.map(([info, column]) => views.get(info.id) ?? Object.freeze({ ...info, order: -1, column })),
  );
  const inZone = (name: ColumnZone) => Object.freeze(visibleColumns.filter((view) => view.zone === name));
  return Object.freeze({
    allColumns,
    visibleColumns,
    zones: Object.freeze({ start: inZone("start"), center: inZone("center"), end: inZone("end") }),
    headerGroups: computeHeaderGroups(visibleColumns),
  });
}
