import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { createPortal } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { ariaSort, isInteractiveEvent, selectAllInputProps, selectInputProps, useRovingTabIndex, useRowLink } from "./a11y.js";

const compiled = /\$\[\d+\]/;

describe("ariaSort", () => {
  it("maps each direction", () => {
    expect(ariaSort("asc")).toBe("ascending");
    expect(ariaSort("desc")).toBe("descending");
    expect(ariaSort(false)).toBe("none");
    expect(ariaSort(false, { includeNone: false })).toBeUndefined();
    expect(ariaSort("asc", { includeNone: false })).toBe("ascending");
  });
});

describe("isInteractiveEvent", () => {
  it("is true for targets outside currentTarget and for non-elements", () => {
    const row = document.createElement("div");
    const outside = document.createElement("span");
    expect(isInteractiveEvent({ target: outside, currentTarget: row })).toBe(true);
    expect(isInteractiveEvent({ target: null, currentTarget: row })).toBe(true);
    expect(isInteractiveEvent({ target: row, currentTarget: row })).toBe(false);
  });

  it("ignores interactive roles on currentTarget itself", () => {
    const row = document.createElement("div");
    row.setAttribute("role", "button");
    const cell = row.appendChild(document.createElement("span"));
    expect(isInteractiveEvent({ target: cell, currentTarget: row })).toBe(false);
  });
});

function Menu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span data-table-interactive onClick={() => setOpen(true)}>
        open menu
      </span>
      {open && createPortal(<div role="menu">portal item</div>, document.body)}
    </>
  );
}

interface LinkRowProps {
  readonly onNavigate: () => void;
  readonly disabled?: boolean;
}

function LinkRow({ onNavigate, disabled }: LinkRowProps) {
  const props = useRowLink(onNavigate, { disabled: disabled === true });
  return (
    <table>
      <tbody>
        <tr data-testid="row" {...props}>
          <td>plain</td>
          <td>
            <button type="button">edit</button>
            <a href="#x">link</a>
            <input aria-label="field" />
            <span role="button">fake button</span>
            <Menu />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

describe("useRowLink", () => {
  it("navigates on a plain click, Enter and Space", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn<() => void>();
    render(<LinkRow onNavigate={onNavigate} />);
    await user.click(screen.getByText("plain"));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    const row = screen.getByTestId("row");
    expect(row.tabIndex).toBe(0);
    row.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onNavigate).toHaveBeenCalledTimes(3);
  });

  it("ignores interactive elements, portals and modified clicks", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn<() => void>();
    render(<LinkRow onNavigate={onNavigate} />);
    for (const element of [
      screen.getByRole("button", { name: "edit" }),
      screen.getByRole("link"),
      screen.getByRole("textbox"),
      screen.getByRole("button", { name: "fake button" }),
      screen.getByText("open menu"),
    ]) {
      await user.click(element);
    }
    // The menu renders into document.body, outside the row, and React still bubbles its click to the row.
    const item = screen.getByText("portal item");
    expect(screen.getByTestId("row").contains(item)).toBe(false);
    await user.click(item);
    fireEvent.click(screen.getByText("plain"), { ctrlKey: true });
    fireEvent.click(screen.getByText("plain"), { metaKey: true });
    fireEvent.click(screen.getByText("plain"), { button: 1 });
    screen.getByRole("textbox").focus();
    await user.keyboard("{Enter}");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn<() => void>();
    render(<LinkRow onNavigate={onNavigate} disabled />);
    await user.click(screen.getByText("plain"));
    expect(screen.getByTestId("row").hasAttribute("tabindex")).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe("selectInputProps", () => {
  it("calls toggle with no arguments", () => {
    const toggle = vi.fn<() => void>();
    const props = selectInputProps({ checked: true, toggle, label: "Select Ada" });
    expect(props).toMatchObject({ type: "checkbox", checked: true, "aria-label": "Select Ada", disabled: false });
    render(<input {...props} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(toggle).toHaveBeenCalledWith();
  });
});

interface SelectAllProps {
  readonly onToggle: () => void;
}

/** Selected counts out of three. A toggle adds one but stays below three, so the box stays indeterminate. */
function SelectAll({ onToggle }: SelectAllProps) {
  const [count, setCount] = useState(1);
  const all = count === 3;
  return (
    <>
      <input
        {...selectAllInputProps({
          checked: all,
          indeterminate: count > 0 && !all,
          label: "Select all",
          toggle: () => {
            onToggle();
            setCount((n) => (n === 1 ? 1 : n + 1));
          },
        })}
      />
      <button type="button" onClick={() => setCount(3)}>
        all
      </button>
    </>
  );
}

describe("selectAllInputProps", () => {
  it("keeps the DOM indeterminate after a click that leaves it indeterminate", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn<() => void>();
    render(<SelectAll onToggle={onToggle} />);
    const box = screen.getByRole<HTMLInputElement>("checkbox", { name: "Select all" });
    expect(box.indeterminate).toBe(true);
    expect(box.getAttribute("aria-checked")).toBe("mixed");
    await user.click(box);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(box.indeterminate).toBe(true);
    expect(box.checked).toBe(false);
    await user.click(box);
    expect(box.indeterminate).toBe(true);
    await user.click(screen.getByRole("button", { name: "all" }));
    expect(box.indeterminate).toBe(false);
    expect(box.checked).toBe(true);
    expect(box.getAttribute("aria-checked")).toBe("true");
  });

  it("is compiled", () => {
    expect(String(SelectAll)).toMatch(compiled);
  });
});

interface GridProps {
  readonly rows: number;
  readonly loop?: boolean;
}

function Grid({ rows, loop }: GridProps) {
  const { getCellProps, activeCell, setActiveCell } = useRovingTabIndex({ rowCount: rows, colCount: 3, loop: loop === true });
  return (
    <>
      <table>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {[0, 1, 2].map((c) => (
                <td key={c} {...getCellProps(r, c)}>
                  {`${r}:${c}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <output>{`${activeCell.row}:${activeCell.col}`}</output>
      <button type="button" onClick={() => setActiveCell(1, 1)}>
        center
      </button>
    </>
  );
}

function WithInput() {
  const { getCellProps } = useRovingTabIndex({ rowCount: 1, colCount: 2 });
  return (
    <div>
      <div {...getCellProps(0, 0)}>
        <input aria-label="inner" />
      </div>
      <div {...getCellProps(0, 1)}>b</div>
    </div>
  );
}

const tabStops = (): string[] => screen.getAllByRole("cell").filter((cell) => cell.tabIndex === 0).map((cell) => cell.textContent ?? "");

describe("useRovingTabIndex", () => {
  it("moves the tab stop and focus with arrows, Home and End", async () => {
    const user = userEvent.setup();
    render(<Grid rows={3} />);
    expect(tabStops()).toEqual(["0:0"]);
    await user.tab();
    expect(document.activeElement?.textContent).toBe("0:0");
    const expectAt = (text: string) => {
      expect(document.activeElement?.textContent).toBe(text);
      expect(tabStops()).toEqual([text]);
    };
    await user.keyboard("{ArrowRight}");
    expectAt("0:1");
    await user.keyboard("{ArrowDown}");
    expectAt("1:1");
    await user.keyboard("{ArrowLeft}");
    expectAt("1:0");
    await user.keyboard("{ArrowLeft}");
    expectAt("1:0");
    await user.keyboard("{ArrowUp}");
    expectAt("0:0");
    await user.keyboard("{ArrowUp}");
    expectAt("0:0");
    await user.keyboard("{End}");
    expectAt("0:2");
    await user.keyboard("{Home}");
    expectAt("0:0");
    await user.keyboard("{Control>}{End}{/Control}");
    expectAt("2:2");
    await user.keyboard("{Control>}{Home}{/Control}");
    expectAt("0:0");
  });

  it("wraps with loop, follows clicks and clamps when rows go away", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Grid rows={3} loop />);
    await user.tab();
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement?.textContent).toBe("0:2");
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement?.textContent).toBe("2:2");
    await user.click(screen.getByText("1:0"));
    expect(tabStops()).toEqual(["1:0"]);
    await user.click(screen.getByRole("button", { name: "center" }));
    expect(screen.getByRole("status").textContent).toBe("1:1");
    await user.click(screen.getByText("2:2"));
    rerender(<Grid rows={1} loop />);
    expect(tabStops()).toEqual(["0:2"]);
  });

  it("is compiled", () => {
    expect(String(Grid)).toMatch(compiled);
    expect(String(useRovingTabIndex)).toMatch(compiled);
    expect(String(LinkRow)).toMatch(compiled);
  });

  it("leaves keys from inside a cell alone", () => {
    render(<WithInput />);
    const input = screen.getByRole("textbox");
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(document.activeElement).toBe(input);
  });
});
