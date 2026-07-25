import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HomeScreen } from "./HomeScreen";

describe("HomeScreen", () => {
  it("resumes an active game", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();

    render(
      <HomeScreen
        activeGame={{
          id: "game-1",
          title: "Sunday game",
          currentPlayerName: "Ada",
          currentPlayerColor: "#286b9b",
          round: 3,
          updatedAt: "2026-07-12T12:00:00.000Z",
          players: ["Ada", "Grace", "Linus"],
        }}
        archivedCount={2}
        loading={false}
        error={null}
        onResume={onResume}
        onNewGame={vi.fn()}
        onBoardDesigner={vi.fn()}
        onImport={vi.fn()}
        onSettings={vi.fn()}
        onViewArchive={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Resume game" }));

    expect(onResume).toHaveBeenCalledOnce();
    expect(screen.getByText("Ada's turn")).toBeInTheDocument();
  });

  it("opens the board designer from the home actions", async () => {
    const user = userEvent.setup();
    const onBoardDesigner = vi.fn();

    render(
      <HomeScreen
        activeGame={null}
        archivedCount={0}
        loading={false}
        error={null}
        onResume={vi.fn()}
        onNewGame={vi.fn()}
        onBoardDesigner={onBoardDesigner}
        onImport={vi.fn()}
        onSettings={vi.fn()}
        onViewArchive={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /board designer/i }));

    expect(onBoardDesigner).toHaveBeenCalledOnce();
  });
});
