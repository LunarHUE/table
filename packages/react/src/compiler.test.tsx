import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useTableId } from "./index.js";

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
