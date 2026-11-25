import { expect, it } from "vitest";
import { ariaSort } from "./a11y.js";
import { coreName, useTableId } from "./index.js";
import * as legacy from "./legacy.js";
import * as mini from "./mini.js";

it("re-exports core and its own entries", () => {
  expect(coreName).toBe("@lunarhue/table-core");
  expect(ariaSort("asc")).toBe("ascending");
  expect(mini.useTableId).toBe(useTableId);
  expect(typeof legacy.useSyncExternalStore).toBe("function");
  expect(typeof legacy.useId).toBe("function");
});
