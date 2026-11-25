import { expectTypeOf, it } from "vitest";
import { coreName } from "./index.js";

it("keeps the name as a literal type", () => {
  expectTypeOf<typeof coreName>().toEqualTypeOf<"@lunarhue/table-core">();
});
