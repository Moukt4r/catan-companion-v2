import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toWorldEventCatalogView } from "../game/viewMappers";
import { WorldEventsScreen } from "./WorldEventsScreen";

describe("WorldEventsScreen", () => {
  it("lists the whole built-in catalog without needing a game", () => {
    const view = toWorldEventCatalogView();
    render(<WorldEventsScreen view={view} onBack={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "World Events", level: 1 }),
    ).toBeVisible();
    // Every catalog entry renders, grouped by category.
    expect(screen.getAllByRole("listitem")).toHaveLength(view.totalCount);
    expect(view.totalCount).toBeGreaterThan(30);
  });

  it("omits deck progress, which only means something inside a game", () => {
    const view = toWorldEventCatalogView();
    expect(view.deck).toBeNull();

    render(<WorldEventsScreen view={view} onBack={vi.fn()} />);

    expect(screen.queryByText("Seen this year")).not.toBeInTheDocument();
  });

  it("returns to the home screen", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <WorldEventsScreen view={toWorldEventCatalogView()} onBack={onBack} />,
    );

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalledOnce();
  });
});
