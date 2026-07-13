import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DieFace } from "./DieFace";

describe("DieFace", () => {
  it("exposes a complete accessible numbered result", () => {
    render(<DieFace kind="red" label="Red die" value={5} />);

    expect(screen.getByLabelText("Red die: 5")).toBeInTheDocument();
  });

  it("exposes the event name instead of relying on color", () => {
    render(<DieFace kind="event" label="Event die" value="barbarian" />);

    expect(screen.getByLabelText("Event die: Ship")).toBeInTheDocument();
  });
});
