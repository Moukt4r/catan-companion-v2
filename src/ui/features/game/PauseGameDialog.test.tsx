import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PauseGameDialog } from "./PauseGameDialog";

describe("PauseGameDialog", () => {
  it("shows frozen times and exposes only the resume game action", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    render(
      <PauseGameDialog
        open
        currentPlayerName="Ada"
        currentPlayerColor="#123456"
        currentTurnMs={65_000}
        totalGameMs={3_661_000}
        canResume
        busy={false}
        onResume={onResume}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Game paused" }),
    ).toHaveAccessibleDescription(
      "All active-play timers are stopped and every other game control is disabled.",
    );
    expect(screen.getByText("00:01:05")).toBeVisible();
    expect(screen.getByText("01:01:01")).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Resume game" }));
    expect(onResume).toHaveBeenCalledOnce();
  });

  it("prevents a read-only tab from resuming the game", () => {
    render(
      <PauseGameDialog
        open
        currentPlayerName="Ada"
        currentPlayerColor="#123456"
        currentTurnMs={0}
        totalGameMs={0}
        canResume={false}
        busy={false}
        onResume={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Resume game" })).toBeDisabled();
    expect(
      screen.getByText("Resume the game from the controlling tab."),
    ).toBeVisible();
  });
});
