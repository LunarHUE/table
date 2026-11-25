import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Cell, Header, useTableId } from "./index.js";
import { DataTable } from "./test/data-table.js";
import { NameCell, SelectAllHeader } from "./test/fixtures.js";

interface CaptionProps {
  readonly text: string;
}

function Caption({ text }: CaptionProps) {
  const id = useTableId();
  return <p id={id}>{text.toUpperCase()}</p>;
}

// The Compiler's output reads its memo cache as `$[n]`. Uncompiled code never does.
const compiled = /\$\[\d+\]/;

it("runs the React Compiler over the test components", () => {
  render(<Caption text="rows" />);
  const caption = screen.getByText("ROWS");
  expect(caption.id).not.toBe("");
  expect(String(Caption)).toMatch(compiled);
});

it("compiles the adapter's components and the test table", () => {
  for (const component of [Cell, Header, DataTable, SelectAllHeader, NameCell]) {
    expect(String(component)).toMatch(compiled);
  }
});
