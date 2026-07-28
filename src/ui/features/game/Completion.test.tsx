import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GameCompleteScreen } from "./GameCompleteScreen";
import { WinnerDialog } from "./WinnerDialog";

describe("WinnerDialog", () => {
  it("renders nothing without a candidate", () => {
    const { container } = render(
      <WinnerDialog
        open
        player={null}
        target={13}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("confirms the candidate or keeps playing", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <WinnerDialog
        open
        player={{
          id: "ada",
          name: "Ada",
          color: "#123456",
          victoryPoints: 14,
        }}
        target={13}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    expect(
      screen.getByText(/14 public points against a target of 13/i),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm Ada won" }));
    await user.click(screen.getByRole("button", { name: "Keep playing" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("GameCompleteScreen", () => {
  it("summarizes the result, sorts scores, and routes completion actions", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const onNewGame = vi.fn();
    const onHome = vi.fn();

    render(
      <GameCompleteScreen
        view={{
          title: "Sunday final",
          winnerName: "Ada",
          winnerColor: "#123456",
          completedAt: "2026-07-12T12:00:00.000Z",
          rounds: 8,
          turns: 24,
          totalGameMs: 5_700_000,
          rolls: 22,
          barbarianAttacks: 3,
          thematicEvents: 2,
          players: [
            {
              id: "grace",
              name: "Grace",
              color: "#654321",
              victoryPoints: 9,
              activeTimeMs: 2_100_000,
            },
            {
              id: "ada",
              name: "Ada",
              color: "#123456",
              victoryPoints: 13,
              activeTimeMs: 3_600_000,
            },
          ],
          statistics: {
            averageTotal: 7.2,
            mostCommonTotal: 8,
            rarestRolledTotal: 12,
            alchemyRolls: 2,
            normalRolls: 20,
            yearChanges: 1,
            diceTotals: [
              {
                total: 6,
                count: 4,
                expected: 3.05,
                deviation: 0.95,
                share: 0.18,
              },
              {
                total: 8,
                count: 6,
                expected: 3.05,
                deviation: 2.95,
                share: 0.27,
              },
              {
                total: 12,
                count: 1,
                expected: 0.61,
                deviation: 0.39,
                share: 0.04,
              },
            ],
            eventFaces: [
              { face: "trade", count: 9, share: 0.41 },
              { face: "barbarian", count: 6, share: 0.27 },
            ],
            players: [
              {
                id: "ada",
                name: "Ada",
                color: "#123456",
                rolls: 12,
                averageTotal: 7.5,
                sevens: 3,
                alchemyRolls: 2,
                barbarianFaces: 4,
                luckIndex: 6,
                averageTurnMs: 300_000,
                turns: 12,
              },
              {
                id: "grace",
                name: "Grace",
                color: "#654321",
                rolls: 10,
                averageTotal: 6.8,
                sevens: 1,
                alchemyRolls: 0,
                barbarianFaces: 2,
                luckIndex: -2,
                averageTurnMs: 210_000,
                turns: 10,
              },
            ],
            worldEventsByCategory: [{ category: "nature", count: 2 }],
          },
        }}
        onExport={onExport}
        onNewGame={onNewGame}
        onHome={onHome}
      />,
    );

    expect(screen.getByRole("heading", { name: "Ada wins" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Game summary" }),
    ).toHaveTextContent("01:35:00");
    const scores = within(
      screen.getByRole("region", { name: "Final public scores" }),
    ).getAllByRole("listitem");
    expect(scores[0]).toHaveTextContent("Ada13 VP01:00:00");
    expect(scores[1]).toHaveTextContent("Grace9 VP00:35:00");

    await user.click(screen.getByRole("button", { name: "Export full game" }));
    await user.click(screen.getByRole("button", { name: "Start new game" }));
    await user.click(screen.getByRole("button", { name: "Home" }));

    expect(onExport).toHaveBeenCalledOnce();
    expect(onNewGame).toHaveBeenCalledOnce();
    expect(onHome).toHaveBeenCalledOnce();
  });
});
