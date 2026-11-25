import { render } from "@solidjs/web";
import { flush, type Element as SolidElement } from "solid-js";
import { afterEach, beforeEach, vi } from "vitest";

/** Each mounted tree, disposed after the test. */
const mounted: (() => void)[] = [];

/** Console warnings and errors during a test. Solid reports its dev diagnostics there. */
let reports: unknown[][] = [];

beforeEach(() => {
  reports = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => void reports.push(args));
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void reports.push(args));
});

afterEach(() => {
  for (const dispose of mounted.splice(0)) dispose();
  vi.restoreAllMocks();
  if (reports.length > 0) throw new Error(`Console reports during the test:\n${reports.map((args) => args.map(String).join(" ")).join("\n")}`);
});

/** Renders `ui` into a fresh element in the document and applies it. */
export function mount(ui: () => SolidElement): { readonly host: HTMLElement; readonly dispose: () => void } {
  const host = document.createElement("div");
  document.body.append(host);
  const disposeRender = render(ui, host);
  flush();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    disposeRender();
    host.remove();
  };
  mounted.push(dispose);
  return { host, dispose };
}

/** Lets Solid apply queued writes: the microtask it would wait for, then a flush. */
export async function settle(): Promise<void> {
  await Promise.resolve();
  flush();
}

/** The element matching `selector` in `host`, of type `type`, or a failed test. */
export function get<T extends Element>(host: ParentNode, selector: string, type: abstract new () => T): T {
  const element = host.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`No ${type.name} matches ${selector}.`);
  return element;
}

/** The text of each element matching `selector`. */
export const texts = (host: ParentNode, selector: string): string[] =>
  [...host.querySelectorAll(selector)].map((element) => element.textContent ?? "");

export { counted } from "./counted.js";
