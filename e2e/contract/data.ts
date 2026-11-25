/** A row of the people tables most scenarios show. */
export interface Person {
  readonly id: string;
  readonly name: string;
  readonly role: "admin" | "member";
  readonly age: number;
  readonly city: string;
  readonly email: string;
  readonly lastSeen: string;
}

const person = (id: number, name: string, role: Person["role"], age: number, city: string, lastSeen: string): Person => ({
  id: `p${String(id)}`,
  name,
  role,
  age,
  city,
  email: `${name.split(" ")[0]?.toLowerCase() ?? ""}@example.com`,
  lastSeen,
});

/** Twelve people with distinct names and ages, so every sort has one answer. */
export const people: readonly Person[] = [
  person(1, "Grace Hopper", "admin", 45, "New York", "2026-01-04"),
  person(2, "Ada Lovelace", "member", 36, "London", "2026-02-11"),
  person(3, "Linus Torvalds", "member", 28, "Helsinki", "2026-03-19"),
  person(4, "Barbara Liskov", "admin", 52, "Boston", "2026-01-23"),
  person(5, "Ken Thompson", "member", 61, "Berkeley", "2026-04-02"),
  person(6, "Margaret Hamilton", "admin", 33, "Boston", "2026-02-27"),
  person(7, "Dennis Ritchie", "member", 40, "Berkeley", "2026-05-15"),
  person(8, "Frances Allen", "member", 57, "Albany", "2026-03-08"),
  person(9, "Edsger Dijkstra", "admin", 49, "Austin", "2026-06-30"),
  person(10, "Radia Perlman", "member", 31, "Seattle", "2026-04-21"),
  person(11, "John Backus", "member", 66, "Portland", "2026-05-02"),
  person(12, "Karen Jones", "admin", 24, "Cambridge", "2026-06-12"),
];

/** The names of `rows`, in order. */
export const namesOf = (rows: readonly { readonly name: string }[]): string[] => rows.map((row) => row.name);

/** A row of the pagination scenario. */
export interface Item {
  readonly id: string;
  readonly name: string;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Items 01 to `count`. */
export const itemsUpTo = (count: number): readonly Item[] =>
  Array.from({ length: count }, (_, i) => ({ id: `i${pad(i + 1)}`, name: `Item ${pad(i + 1)}` }));
