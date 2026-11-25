import { expectTypeOf, it } from "vitest";
import { coreName, solidName } from "./index.js";

it("keeps the names as literal types", () => {
  expectTypeOf<typeof coreName>().toEqualTypeOf<"@lunarhue/table-core">();
  expectTypeOf<typeof solidName>().toEqualTypeOf<"@lunarhue/table-solid">();
});
