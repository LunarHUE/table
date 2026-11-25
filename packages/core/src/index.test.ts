import { expect, it } from "vitest";
import { coreName } from "./index.js";

it("names the package", () => {
  expect(coreName).toBe("@lunarhue/table-core");
});
