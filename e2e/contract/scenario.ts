/**
 * What the server HTML of a scenario must show before any script runs. The
 * main table marks each body row with `data-kind` and each cell with
 * `data-col`, and this is read from there.
 */
export interface ServerView {
  /** The `name` cell of every data row, in order. */
  readonly rows: readonly string[];
  /** The header labels, in order. Leave it out to skip the check. */
  readonly headers?: readonly string[];
  /** Text that must be on the page. */
  readonly texts?: readonly string[];
}

/** The part of a scenario every app and spec finds it by. */
export interface ScenarioInfo<I extends string> {
  readonly id: I;
  /** The path of its page, the same in every app. */
  readonly route: `/${I}`;
  /** The page's heading. */
  readonly title: string;
  /** What the server HTML must show with no query string. */
  readonly server: ServerView;
}

/** Starts a scenario's description. The id is kept as a literal type, so the scenario list can name each one. */
export function scenario<I extends string>(id: I, title: string, server: ServerView): ScenarioInfo<I> {
  return { id, route: `/${id}`, title, server };
}
