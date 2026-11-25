import { expect, it } from "vitest";
import * as solid from "./index.js";

it("re-exports core beside its own primitives", () => {
  expect(solid.coreName).toBe("@lunarhue/table-core");
  expect(typeof solid.defineTable).toBe("function");
  expect(typeof solid.createTable).toBe("function");
  expect(typeof solid.Cell).toBe("function");
});
