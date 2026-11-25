import { scenarios } from "./scenarios.js";

/** What an app's server entry renders for one request. The shared server wraps it in the document. */
export interface RenderedPage {
  readonly status: number;
  /** Markup for the document's head, such as Solid's hydration script. */
  readonly head: string;
  /** The app's markup, put inside the element with id `appElementId`. */
  readonly body: string;
}

/**
 * What every app's server entry exports as `render`. `search` is the query
 * string with its `?`, or `""`, so a page bound to the URL renders the state
 * the URL holds.
 */
export type RenderPage = (path: string, search: string) => RenderedPage;

/** The id of the element each app renders into and hydrates. */
export const appElementId = "app";

/** Where each app's client build puts its entry, under `dist/client`. */
export const clientEntry = "assets/client.js";

/** The status for a path: 200 for the index and every scenario, 404 for anything else. */
export const statusFor = (path: string): number =>
  path === "/" || scenarios.some((entry) => entry.route === path) ? 200 : 404;

/** Test ids of the elements scenario pages have. */
export const testIds = {
  /** The state probe, filled once the page is live. */
  probe: "probe",
  /** The scenario's main table. */
  table: "table",
  /** A render counter. */
  renders: (id: string): string => `renders-${id}`,
};

/** The heading of the index page. */
export const indexTitle = "Table end-to-end";
