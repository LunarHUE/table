import {
  defineCell,
  defineTable,
  filtering,
  pagination,
  selectable,
  selection,
  sorting,
  type CellApi,
  type HeaderApi,
  type SelectionCellApi,
  type SelectionHeaderApi,
} from "../index.js";

export interface User {
  readonly id: string;
  readonly name: string;
  readonly joined: Date;
}

export const users: readonly User[] = [
  { id: "1", name: "Cy", joined: new Date("2024-03-01T00:00:00Z") },
  { id: "2", name: "Ada", joined: new Date("2024-01-01T00:00:00Z") },
  { id: "3", name: "Bob", joined: new Date("2024-02-01T00:00:00Z") },
];

/** Render counts by name. Components call `track` while they render; tests read the counts. */
export const renders = new Map<string, number>();

export function track(name: string): void {
  renders.set(name, (renders.get(name) ?? 0) + 1);
}

/** A snapshot of the counts, to compare before and after an action. */
export const counts = (): ReadonlyMap<string, number> => new Map(renders);

/** How many times `name` rendered since `before`. */
export const since = (before: ReadonlyMap<string, number>, name: string): number => (renders.get(name) ?? 0) - (before.get(name) ?? 0);

interface SelectCellProps {
  readonly cell: CellApi<unknown, User, SelectionCellApi>;
}

function SelectCellView({ cell }: SelectCellProps) {
  track(`select:${cell.row.id}`);
  return <input type="checkbox" aria-label={`select ${cell.row.id}`} checked={cell.selected} onChange={cell.toggleSelected} />;
}

/** A checkbox cell whose part comes from `defineCell`. */
export const SelectCell = defineCell(SelectCellView, selectable());

interface SelectAllHeaderProps {
  readonly header: HeaderApi<User, SelectionHeaderApi>;
}

/** A select-all header; the column's `selectable()` part gives it its API. */
export function SelectAllHeader({ header }: SelectAllHeaderProps) {
  return (
    <input
      type="checkbox"
      aria-label="select page"
      checked={header.checked}
      data-indeterminate={String(header.indeterminate)}
      onChange={header.toggle}
    />
  );
}

interface NameCellProps {
  readonly cell: CellApi<string, User>;
}

export function NameCell({ cell }: NameCellProps) {
  track(`name:${cell.row.id}`);
  const locale = typeof cell.meta["locale"] === "string" ? cell.meta["locale"] : "";
  return (
    <span>
      {cell.value}
      {locale === "" ? null : ` (${locale})`}
    </span>
  );
}

interface DateCellProps {
  readonly cell: CellApi<Date, User>;
}

export function DateCell({ cell }: DateCellProps) {
  return <time>{cell.value.toISOString().slice(0, 10)}</time>;
}

interface Filters {
  readonly q: string;
}

export const userTable = defineTable<User>()({
  getRowId: (user) => user.id,
  columns: (col) => [
    col.custom("select", { parts: [selectable()], cell: SelectCell, header: SelectAllHeader }),
    col.key("name", { sortable: true, cell: NameCell }),
    col.key("joined", { sortable: true, label: "Joined", cell: DateCell }),
    col.accessor("initial", (user) => user.name.slice(0, 1)),
  ],
  features: [
    sorting(),
    filtering<Filters, User>({ initial: { q: "" }, rows: (user, filters) => user.name.toLowerCase().includes(filters.q.toLowerCase()) }),
    pagination({ sizes: [2, 5] }),
    selection(),
  ],
});

/** A table with pagination only, for the generic component on a smaller table. */
export const pagedTable = defineTable<User>()({
  getRowId: (user) => user.id,
  columns: (col) => [col.key("name", { cell: NameCell })],
  features: [pagination({ sizes: [2] })],
});
