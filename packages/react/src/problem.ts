// The package has no node types, so this declares the global the development check reads.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/** The errors page, up to the anchor. Each code's entry has the anchor `react:<code>`, as core's have `core:<code>`. */
const docs = "https://table.lunarhue.dev/errors#react:";

/** Every error the adapter raises, as the errors page lists it. */
export type Code = "table:handle";

/**
 * The message for `code`. Development says it in a sentence and links to the
 * code's entry on the errors page. Production builds fold the check away and
 * say the code alone, as core does.
 */
export function problem(code: Code): string {
  let text: string = code;
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    const sentences: Record<Code, string> = {
      "table:handle": "the hooks take the table useTable or createTableStore returned, not a table definition.",
    };
    text = `${sentences[code]} ${docs}${code}`;
  }
  return `@lunarhue/table-react: ${text}`;
}
