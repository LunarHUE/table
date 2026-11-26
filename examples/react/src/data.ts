// The invoices every example shows. They are built from fixed lists and
// arithmetic on the index, so each reload shows the same 50 rows.

export type Status = "paid" | "pending" | "overdue" | "draft";

export interface Invoice {
  readonly id: string;
  readonly customer: string;
  readonly owner: string;
  readonly status: Status;
  /** In US dollars. */
  readonly amount: number;
  /** An ISO date, `YYYY-MM-DD`. */
  readonly issued: string;
}

export const statuses: readonly Status[] = ["paid", "pending", "overdue", "draft"];

export const statusLabels: Readonly<Record<Status, string>> = {
  paid: "Paid",
  pending: "Pending",
  overdue: "Overdue",
  draft: "Draft",
};

export const isStatus = (value: string): value is Status => (statuses as readonly string[]).includes(value);

const customers = [
  "Acme Robotics",
  "Bluebird Bakery",
  "Cobalt Labs",
  "Driftwood Studio",
  "Evergreen Clinic",
  "Foxglove Media",
  "Granite Freight",
  "Harbor Coffee",
  "Ironclad Security",
  "Juniper Schools",
  "Kestrel Air",
  "Lumen Energy",
];

const owners = ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Katherine Johnson", "Linus Torvalds"];

const pick = <T>(list: readonly T[], index: number): T => {
  const item = list[index % list.length];
  if (item === undefined) throw new Error("pick() needs a non-empty list.");
  return item;
};

const day = (offset: number): string => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);

const invoice = (i: number): Invoice => ({
  id: `INV-${String(1001 + i)}`,
  customer: pick(customers, i * 5),
  owner: pick(owners, i * 3),
  status: pick(statuses, (i * 7) % 11),
  amount: 250 + ((i * 7919) % 9000) + ((i * 37) % 100) / 100,
  issued: day((i * 37) % 300),
});

export const invoices: readonly Invoice[] = Array.from({ length: 50 }, (_, i) => invoice(i));

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const formatMoney = (amount: number): string => money.format(amount);

export const formatDate = (iso: string): string => date.format(new Date(`${iso}T00:00:00Z`));
