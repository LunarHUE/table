import { expectTypeOf, it } from "vitest";
import { coreName, useTableId } from "./index.js";
import { useId, useSyncExternalStore } from "./legacy.js";

it("types the placeholder exports", () => {
  expectTypeOf<typeof coreName>().toEqualTypeOf<"@lunarhue/table-core">();
  expectTypeOf(useTableId).toEqualTypeOf<() => string>();
  expectTypeOf(useId).toEqualTypeOf<() => string>();
  expectTypeOf(useSyncExternalStore(() => () => {}, () => 1)).toEqualTypeOf<number>();
});
