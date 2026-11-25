import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Every `render` from Testing Library wraps the tree in <StrictMode>.
configure({ reactStrictMode: true });

// Vitest runs without globals, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup();
});
