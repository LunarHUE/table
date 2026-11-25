import type { RowIdContext } from "./column.js";
import { ROW_STAGE_PHASES, type ColumnInfo, type RowLike } from "./contract.js";
import type { AnyFeature, ResolvedFeatures } from "./feature.js";
import { problem } from "./problem.js";

// The row pipeline turns the app's data into the rows a table shows. Data
// stays outside the store: each call gets the data and reads the feature
// state the stages need. Stages run phase by phase, and each one keeps its
// last output, so a write that no stage reads runs no stage at all.

/** A row made from one item of the app's data. */
export interface DataRow<TRow> extends RowLike<TRow> {
  readonly kind: "data";
  readonly parentId: string | null;
  /** Whether the row has something to expand, such as child rows or a detail row. */
  readonly canExpand: boolean;
  readonly isExpanded: boolean;
}

/** The detail row shown under an expanded data row. Its `original` is the parent's. */
export interface DetailRow<TRow> extends RowLike<TRow> {
  readonly kind: "detail";
  readonly parentId: string;
  readonly canExpand: false;
  readonly isExpanded: false;
}

/** A row as the table shows it. Check `kind` to tell the two apart. */
export type Row<TRow> = DataRow<TRow> | DetailRow<TRow>;

/** What the app knows about its data besides the rows, as when a server pages them. */
export interface TableRowsOptions {
  /** How many rows match on the server. Defaults to the rows that matched here. */
  readonly totalCount?: number;
  /** The request key the data was fetched for. The view is stale when it differs from the table's. */
  readonly requestKey?: string;
  readonly error?: unknown;
  /** Set while the rows are a stand-in, such as the previous page during a fetch. */
  readonly isPlaceholder?: boolean;
  /** The page size, to work out `pageCount`. */
  readonly pageSize?: number;
}

/** The rows a table shows, with counts. */
export interface TableRowsView<TRow> {
  readonly rows: readonly Row<TRow>[];
  /**
   * The data rows left after filtering and sorting, before a window phase cut
   * out a page. Detail rows don't count.
   */
  readonly matchingCount: number;
  /** `options.totalCount`, or `matchingCount` when the app gave none. */
  readonly totalCount: number;
  /** `totalCount` over `options.pageSize`, rounded up. Undefined without a page size. */
  readonly pageCount: number | undefined;
  /** True when the data was fetched for another request than the table's current one. */
  readonly isStale: boolean;
  readonly error: unknown;
  readonly isPlaceholder: boolean;
}

/** What the row pipeline needs from a table definition. */
export interface RowPipelineDef<TRow> {
  readonly getRowId: (row: TRow, ctx: RowIdContext) => string;
  readonly resolvedFeatures: ResolvedFeatures;
}

/**
 * Computes the rows for `data`. `columns` is what stages see as the
 * table's columns, and `requestKey` returns the table's current request
 * key, read only when `options.requestKey` is set.
 */
export type RowPipeline<TRow> = (
  data: readonly TRow[],
  columns: readonly ColumnInfo[],
  options?: TableRowsOptions,
  requestKey?: () => string,
) => TableRowsView<TRow>;

/** Whether two lists hold the same values, by `Object.is`. */
export const sameList = (a: readonly unknown[], b: readonly unknown[] | undefined): boolean =>
  b !== undefined && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

interface Stage {
  readonly name: string;
  readonly phase: number;
  readonly stage: NonNullable<AnyFeature["def"]["rowStage"]>;
  readonly feature: AnyFeature;
  /** The stage's last inputs and output. */
  memo: { readonly deps: readonly unknown[]; readonly output: readonly RowLike[] } | undefined;
}

const viewKeys = ["rows", "matchingCount", "totalCount", "pageCount", "isStale", "error", "isPlaceholder"] as const;

const keyOf = (row: RowLike) => `${row.kind}\0${row.id}`;

/** Counts data rows. Detail rows hang off a data row, so they aren't matches of their own. */
const countData = (rows: readonly RowLike[]): number => rows.reduce((count, row) => (row.kind === "data" ? count + 1 : count), 0);

/**
 * Makes the row pipeline for a table. `readSlice` reads a feature's state
 * by name. The pipeline keeps rows from one call to the next: a row whose
 * fields didn't change is the same object, so a memoized row component
 * skips it.
 */
export function createRowPipeline<TRow>(def: RowPipelineDef<TRow>, readSlice: (name: string) => unknown): RowPipeline<TRow> {
  const windowPhase = ROW_STAGE_PHASES.indexOf("window");
  // Phase by phase, and in resolved feature order within a phase.
  const stages: Stage[] = [];
  ROW_STAGE_PHASES.forEach((phase, index) => {
    for (const feature of def.resolvedFeatures.ordered) {
      const stage = feature.def.rowStage;
      if (stage?.phase === phase) stages.push({ name: feature.name, phase: index, stage, feature, memo: undefined });
    }
  });

  /** Rows this pipeline made. A stage that passes one through hands back the same object. */
  const made = new WeakSet();
  let lastData: readonly TRow[] | undefined;
  let base: readonly DataRow<TRow>[] = [];
  let baseById = new Map<string, DataRow<TRow>>();
  let lastOutput: readonly RowLike[] | undefined;
  let rows: readonly Row<TRow>[] = [];
  let rowsByKey = new Map<string, Row<TRow>>();
  let lastView: TableRowsView<TRow> | undefined;

  const freeze = <T extends Row<TRow>>(row: T): T => {
    made.add(Object.freeze(row));
    return row;
  };

  const build = (data: readonly TRow[]) => {
    const byId = new Map<string, DataRow<TRow>>();
    const next: DataRow<TRow>[] = [];
    let same = data.length === base.length;
    data.forEach((original, index) => {
      const id = def.getRowId(original, { index, parentId: null });
      if (byId.has(id)) throw new Error(problem("row:duplicate-id", id));
      const prev = baseById.get(id);
      const row =
        prev && Object.is(prev.original, original) && prev.index === index
          ? prev
          : freeze<DataRow<TRow>>({ kind: "data", id, index, depth: 0, parentId: null, canExpand: false, isExpanded: false, original });
      byId.set(id, row);
      next.push(row);
      if (row !== base[index]) same = false;
    });
    baseById = byId;
    // A new array of the same items keeps the old one, so the stages skip their work.
    if (!same) base = Object.freeze(next);
  };

  /** Makes a stage's output row into a `Row`, reusing the last call's object when its fields match. */
  const settle = (row: RowLike, byKey: Map<string, Row<TRow>>): Row<TRow> => {
    const key = keyOf(row);
    let result: Row<TRow>;
    if (made.has(row)) {
      // Only this pipeline adds to `made`, and only `Row` objects.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      result = row as Row<TRow>;
    } else {
      const canExpand = "canExpand" in row && row.canExpand === true;
      const isExpanded = "isExpanded" in row && row.isExpanded === true;
      // Stages pass originals through, so an original is still a `TRow`.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const original = row.original as TRow;
      const prev = rowsByKey.get(key);
      if (
        prev &&
        prev.kind === row.kind &&
        Object.is(prev.original, original) &&
        prev.index === row.index &&
        prev.depth === row.depth &&
        prev.parentId === row.parentId &&
        prev.canExpand === canExpand &&
        prev.isExpanded === isExpanded
      ) {
        result = prev;
      } else {
        const { id, index, depth, parentId } = row;
        result =
          row.kind === "detail"
            ? freeze<DetailRow<TRow>>({ kind: "detail", id, index, depth, parentId: parentId ?? "", canExpand: false, isExpanded: false, original })
            : freeze<DataRow<TRow>>({ kind: "data", id, index, depth, parentId, canExpand, isExpanded, original });
      }
    }
    byKey.set(key, result);
    return result;
  };

  return (data, columns, options, requestKey) => {
    if (data !== lastData) {
      build(data);
      lastData = data;
    }
    let output: readonly RowLike[] = base;
    let matchingCount: number | undefined;
    for (const entry of stages) {
      if (matchingCount === undefined && entry.phase >= windowPhase) matchingCount = countData(output);
      const state = readSlice(entry.name);
      const reads = entry.stage.reads ?? [];
      const deps = [output, columns, state, ...reads.map(readSlice)];
      if (!entry.memo || !sameList(deps, entry.memo.deps)) {
        const ctx = { state, options: entry.feature.options, columns, getFeatureState: readSlice };
        entry.memo = { deps, output: entry.stage.run(output, ctx) };
      }
      output = entry.memo.output;
    }
    matchingCount ??= countData(output);

    if (output !== lastOutput) {
      const byKey = new Map<string, Row<TRow>>();
      const next = output.map((row) => settle(row, byKey));
      rowsByKey = byKey;
      lastOutput = output;
      if (!sameList(next, rows)) rows = Object.freeze(next);
    }

    const totalCount = options?.totalCount ?? matchingCount;
    const pageSize = options?.pageSize;
    const view: TableRowsView<TRow> = {
      rows,
      matchingCount,
      totalCount,
      pageCount: pageSize !== undefined && pageSize > 0 ? Math.ceil(totalCount / pageSize) : undefined,
      isStale: options?.requestKey !== undefined && options.requestKey !== requestKey?.(),
      error: options?.error,
      isPlaceholder: options?.isPlaceholder ?? false,
    };
    const prev = lastView;
    if (prev && viewKeys.every((key) => Object.is(view[key], prev[key]))) return prev;
    return (lastView = Object.freeze(view));
  };
}
