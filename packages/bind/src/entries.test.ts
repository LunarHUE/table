import { expect, it } from "vitest";
import { nuqsBinding } from "./nuqs.js";
import { solidBinding } from "./solid.js";
import { zustandBinding } from "./zustand.js";

it("names each entry", () => {
  expect(nuqsBinding).toBe("@lunarhue/table-bind/nuqs");
  expect(zustandBinding).toBe("@lunarhue/table-bind/zustand");
  expect(solidBinding).toBe("@lunarhue/table-bind/solid");
});
