import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DieFace } from "./DieFace";

describe("DieFace", () => {
  it("exposes a complete accessible numbered result", () => {
    render(<DieFace kind="red" label="Red die" value={5} />);

    expect(screen.getByLabelText("Red die: 5")).toBeInTheDocument();
  });

  it("exposes the event name while keeping its illustration decorative", () => {
    const { container } = render(
      <DieFace kind="event" label="Event die" value="barbarian" />,
    );

    expect(screen.getByLabelText("Event die: Ship")).toBeInTheDocument();
    expect(container.querySelector(".die__event-art")).toHaveAttribute(
      "alt",
      "",
    );
  });

  it("tints the numbered red die to match the event face that was rolled", () => {
    const { container } = render(
      <DieFace kind="red" label="Red die" value={4} eventFace="science" />,
    );

    const die = container.querySelector(".die");
    expect(die).toHaveClass("die--red");
    expect(die).toHaveClass("die--face-science");
    // The number still reads as the numbered result, not as an event.
    expect(screen.getByLabelText("Red die: 4")).toBeInTheDocument();
  });

  it("leaves the red die untinted before an event has been rolled", () => {
    const { container } = render(
      <DieFace kind="red" label="Red die" value={null} />,
    );

    const die = container.querySelector(".die");
    expect(die).toHaveClass("die--red");
    expect(die?.className).not.toContain("die--face-");
  });

  it("never tints the white die, which carries no event meaning", () => {
    const { container } = render(
      <DieFace kind="yellow" label="White die" value={3} eventFace="trade" />,
    );

    const die = container.querySelector(".die");
    expect(die).toHaveClass("die--yellow");
    expect(die?.className).not.toContain("die--face-");
  });
});
