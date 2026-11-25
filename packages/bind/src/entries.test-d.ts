import { expectTypeOf, it } from "vitest";
import { nuqsBinding } from "./nuqs.js";
import { solidBinding } from "./solid.js";
import { zustandBinding } from "./zustand.js";

it("keeps the names as literal types", () => {
  expectTypeOf<typeof nuqsBinding>().toEqualTypeOf<"@lunarhue/table-bind/nuqs">();
  expectTypeOf<typeof zustandBinding>().toEqualTypeOf<"@lunarhue/table-bind/zustand">();
  expectTypeOf<typeof solidBinding>().toEqualTypeOf<"@lunarhue/table-bind/solid">();
});
