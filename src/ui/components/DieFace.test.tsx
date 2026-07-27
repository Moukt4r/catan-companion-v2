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

  it("keeps the flat die when animation is off", () => {
    const { container } = render(
      <DieFace kind="red" label="Red die" value={4} />,
    );

    expect(container.querySelector(".die3d__cube")).toBeNull();
    expect(container.querySelector(".die__number")).toHaveTextContent("4");
  });

  it("builds a six-sided cube when animation is on", () => {
    const { container } = render(
      <DieFace kind="red" label="Red die" value={4} animated />,
    );

    expect(container.querySelector(".die3d__cube")).not.toBeNull();
    expect(container.querySelectorAll(".die3d__face")).toHaveLength(6);
    // The result stays readable to assistive tech regardless of the animation.
    expect(screen.getByLabelText("Red die: 4")).toBeInTheDocument();
  });

  it("lands on the face the deck drew, whatever the spin", () => {
    // The whole point of the animation: it decides how the die travels, never
    // what it shows. Each value must come to rest at its own rotation, modulo
    // the whole turns added while tumbling.
    const resting: Record<number, { x: number; y: number }> = {
      1: { x: 0, y: 0 },
      2: { x: 0, y: 270 },
      3: { x: 270, y: 0 },
      4: { x: 90, y: 0 },
      5: { x: 0, y: 90 },
      6: { x: 0, y: 180 },
    };

    for (const [value, expected] of Object.entries(resting)) {
      const { container, unmount } = render(
        <DieFace
          kind="yellow"
          label="White die"
          value={Number(value)}
          animated
          rolling
        />,
      );
      const cube = container.querySelector<HTMLElement>(".die3d__cube");
      const match = /rotateX\((-?\d+)deg\) rotateY\((-?\d+)deg\)/.exec(
        cube?.style.transform ?? "",
      );
      expect(match, `value ${value} should set a cube rotation`).not.toBeNull();

      const x = ((Number(match?.[1]) % 360) + 360) % 360;
      const y = ((Number(match?.[2]) % 360) + 360) % 360;
      expect({ x, y }, `value ${value} must rest on its own face`).toEqual(
        expected,
      );
      unmount();
    }
  });
});
