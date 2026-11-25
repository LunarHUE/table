// React's own hooks, the default build. An app on React 16.8 or 17 sets the
// `@lunarhue/react-legacy` condition, and `#lunarhue/react` resolves to
// `legacy.ts` instead, which exports the same names with fallbacks.
import * as React from "react";
import type { UseSyncExternalStore } from "./legacy.js";

// The package has no node types, so this declares the one global the check reads.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

// Read through a loosely typed object, not as named imports, so on React 17
// the app fails with this module's error and not the bundler's missing export.
const hooks: Partial<Pick<typeof React, "useId" | "useSyncExternalStore" | "useTransition">> = React;

if (typeof process !== "undefined" && process.env.NODE_ENV !== "production" && !hooks.useSyncExternalStore) {
  throw new Error(
    "@lunarhue/table-react needs React 18 or later. On React 16.8 or 17, resolve with the @lunarhue/react-legacy condition.",
  );
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const useSyncExternalStore = hooks.useSyncExternalStore as UseSyncExternalStore;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const useId = hooks.useId as () => string;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const useTransition = hooks.useTransition as () => readonly [boolean, (fn: () => void) => void];
