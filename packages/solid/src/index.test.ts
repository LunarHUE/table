import { expect, it } from "vitest";
import { coreName, solidName } from "./index.js";

it("re-exports core", () => {
  expect(coreName).toBe("@lunarhue/table-core");
  expect(solidName).toBe("@lunarhue/table-solid");
});
