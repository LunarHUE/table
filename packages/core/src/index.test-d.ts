import { expectTypeOf, it } from "vitest";
import { coreName } from "./index.js";
import { urlName } from "./url/index.js";

it("keeps the names as literal types", () => {
  expectTypeOf<typeof coreName>().toEqualTypeOf<"@lunarhue/table-core">();
  expectTypeOf<typeof urlName>().toEqualTypeOf<"@lunarhue/table-core/url">();
});
