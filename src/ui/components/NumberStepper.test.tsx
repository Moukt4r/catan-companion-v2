import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NumberStepper } from "./NumberStepper";

describe("NumberStepper", () => {
  it("increments and decrements within its range", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <NumberStepper
        label="Victory points"
        value={3}
        min={0}
        max={4}
        onChange={onChange}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Increase Victory points" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(4);

    rerender(
      <NumberStepper
        label="Victory points"
        value={4}
        min={0}
        max={4}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Increase Victory points" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Decrease Victory points" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it("clamps direct input to the configured range", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <NumberStepper
        label="Cities"
        value={1}
        min={0}
        max={4}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("spinbutton", { name: "Cities" });
    await user.clear(input);
    await user.type(input, "9");

    expect(onChange).toHaveBeenLastCalledWith(4);
  });
});
