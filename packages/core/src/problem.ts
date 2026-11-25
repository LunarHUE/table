// Core has no node types, so this declares the global the development check reads.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/**
 * The errors page, up to the anchor. Each code's entry has the anchor
 * `core:<code>`. Only development messages carry the link, so production
 * builds don't pay for it in every message.
 */
const docs = "https://table.lunarhue.dev/errors#core:";

/** Every error and warning core raises, as the errors page lists it. */
export type Code =
  | "feature:duplicate"
  | "feature:cycle"
  | "feature:missing"
  | "feature:unknown"
  | "column:duplicate"
  | "column:unknown"
  | "row:duplicate-id"
  | "store:copies"
  | "bind:owner";

/**
 * The message for `code`: the package, then what went wrong. Development
 * says it in a sentence, built from `value`, and links to the code's entry on
 * the errors page. A bundler replaces the read of NODE_ENV with "production",
 * folds the check to false and drops the sentences and the link, so
 * production says the code, with `value` after it when there is one.
 */
export function problem(code: Code, value = ""): string {
  let text = value ? `${code} ${value}` : code;
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    const sentences: Record<Code, (value: string) => string> = {
      "feature:duplicate": (name) => `Two features are named "${name}".`,
      "feature:cycle": (name) => `Feature "${name}" is part of a \`requires\` cycle.`,
      "feature:missing": (names) => {
        const [name, by] = names.split(" ");
        return `Add ${name}() to this table's features: ${by ? `feature "${by}" requires it` : "the table uses it"}.`;
      },
      "feature:unknown": (name) => `No feature is named "${name}".`,
      "column:duplicate": (id) => `Two columns have the id "${id}". Give each column its own id.`,
      "column:unknown": (id) => `No column has the id "${id}".`,
      "row:duplicate-id": (id) => `Two rows have the id "${id}". Return a unique id from \`getRowId\`.`,
      "store:copies": () => "This table's features come from two copies of @lunarhue/table-core. Install one copy.",
      "bind:owner": (name) =>
        `Slice "${name}" changed owner after the table was made. Keep each slice bound to one owner for the table's life.`,
    };
    text = `${sentences[code](value)} ${docs}${code}`;
  }
  return `@lunarhue/table-core: ${text}`;
}
