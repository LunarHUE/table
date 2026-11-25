import { attachParts, type AnyFeaturePart, type CellApi, type FooterApi, type HeaderApi, type NoPartApi } from "@lunarhue/table-core";
import type { ReactNode } from "react";

// Slot API types are shared from `@lunarhue/table-core` so React and Solid
// stay identical. `defineCell` wraps `attachParts` with React's component
// return constraint, with no hooks so the server entry exports it too.

export type { CellApi, FooterApi, HeaderApi, NoPartApi };

/**
 * Attaches feature parts to a cell, header or footer component, for every
 * column it renders in: `defineCell(SelectCell, selectable())`. `<Cell>` and
 * `<Header>` then subscribe to what the parts need and add their API to the
 * component's prop. Returns the component itself, untouched; a second call
 * replaces the parts. It reads no property of the component, so a client
 * reference from a server component works.
 */
export function defineCell<TComponent extends (...args: never) => ReactNode>(
  component: TComponent,
  ...parts: readonly AnyFeaturePart[]
): TComponent {
  return attachParts(component, parts);
}
