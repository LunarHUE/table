import { defineStateAdapter, defineTable, remoteFiltering, remotePagination, remoteSorting } from "@lunarhue/table-core";
import { expectTypeOf, it } from "vitest";
import { useTableBinding, type TableBindingResult } from "./binding.js";
import { useTable } from "./hooks.js";

interface User {
  readonly id: string;
  readonly name: string;
}

const usersTable = defineTable<User>()({
  getRowId: (u) => u.id,
  columns: (col) => [col.key("name", { sortable: true })],
  features: [remoteSorting(), remoteFiltering({ initial: { q: "" } }), remotePagination({ sizes: [20] })],
});

it("types useTableBinding result and infers onWrite output from adapter.serialize", () => {
  const adapter = defineStateAdapter({
    features: ["sorting", "pagination", "filtering"] as const,
    parse(_raw: Record<string, string | undefined>, filters?: { parse(x: unknown): Record<string, unknown> }) {
      return filters ? { filtering: filters.parse({}) } : {};
    },
    serialize: () => new URLSearchParams(),
  });

  const result = useTableBinding(usersTable, adapter, {
    input: {},
    onWrite(output) {
      expectTypeOf(output).toEqualTypeOf<URLSearchParams>();
    },
  });

  expectTypeOf(result).toEqualTypeOf<TableBindingResult<typeof usersTable>>();
  expectTypeOf(result.isPending).toEqualTypeOf<boolean>();
  useTable(usersTable, { bind: result.bind });
});

it("enforces required extra option when adapter.parse requires a second parameter", () => {
  const strict = defineStateAdapter({
    features: ["sorting"] as const,
    parse(_raw: string, prefix: string) {
      return { sorting: [{ id: prefix, desc: false }] };
    },
    serialize: () => "ok",
  });

  const res = useTableBinding(usersTable, strict, {
    input: "",
    extra: "u_",
    onWrite(out) {
      expectTypeOf(out).toEqualTypeOf<string>();
    },
  });
  expectTypeOf(res).toEqualTypeOf<TableBindingResult<typeof usersTable>>();

  // @ts-expect-error: `extra` is required by `strict`
  useTableBinding(usersTable, strict, { input: "", onWrite: () => {} });
});
