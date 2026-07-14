import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GameTable, type GameTableView } from "./GameTable";

function view(): GameTableView {
  return {
    title: "Sunday game",
    phaseLabel: "Awaiting roll",
    currentPlayerName: "Ada",
    currentPlayerColor: "#286b9b",
    nextPlayerName: "Grace",
    round: 1,
    turnNumber: 1,
    savedLabel: "Saved",
    saveTone: "success",
    offline: false,
    readOnly: false,
    paused: false,
    canRoll: true,
    showNextRoll: false,
    canRollNextTurn: false,
    canPause: true,
    currentTurnMs: 65_000,
    totalGameMs: 3_661_000,
    rolling: false,
    lastRoll: null,
    numberedCycleProgress: "0 / 36",
    barbarian: {
      position: 0,
      trackLength: 7,
      strength: 3,
      defenderStrength: 0,
    },
    players: [
      {
        id: "ada",
        name: "Ada",
        color: "#286b9b",
        victoryPoints: 3,
        ordinaryCities: 1,
        metropolisDisciplines: [],
        activeKnightStrength: 0,
        activeTimeMs: 65_000,
        improvements: {
          science: 0,
          trade: 0,
          politics: 0,
        },
        current: true,
      },
    ],
    houseEventPending: false,
    winnerCandidateName: null,
  };
}

describe("GameTable", () => {
  it("offers the primary roll action and public player editor", async () => {
    const user = userEvent.setup();
    const onRoll = vi.fn();
    const onEditPlayer = vi.fn();

    render(
      <GameTable
        view={view()}
        onRoll={onRoll}
        onAlchemy={vi.fn()}
        onEditPlayer={onEditPlayer}
        onNextRoll={vi.fn()}
        onPause={vi.fn()}
        onHistory={vi.fn()}
        onSettings={vi.fn()}
        onExport={vi.fn()}
        onConfirmWinner={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Roll" }));
    await user.click(screen.getByRole("button", { name: "Edit public state" }));

    expect(onRoll).toHaveBeenCalledOnce();
    expect(onEditPlayer).toHaveBeenCalledWith("ada");
    expect(screen.getAllByText("00:01:05")).toHaveLength(2);
    expect(screen.getByText("01:01:01")).toBeVisible();
    expect(
      screen.getByRole("meter", {
        name: "7 spaces until the barbarian attack",
      }),
    ).toBeInTheDocument();
  });

  it("disables every state-changing table control in read-only mode", () => {
    render(
      <GameTable
        view={{
          ...view(),
          readOnly: true,
          showNextRoll: true,
          canRollNextTurn: true,
          winnerCandidateName: "Ada",
        }}
        onRoll={vi.fn()}
        onAlchemy={vi.fn()}
        onEditPlayer={vi.fn()}
        onNextRoll={vi.fn()}
        onPause={vi.fn()}
        onHistory={vi.fn()}
        onSettings={vi.fn()}
        onExport={vi.fn()}
        onConfirmWinner={vi.fn()}
      />,
    );

    expect(screen.getByText("Read only")).toBeVisible();
    expect(screen.getByRole("button", { name: "Roll" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use Alchemy" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Edit public state" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Next: Grace & roll" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Confirm winner" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "History" })).toBeEnabled();
  });

  it("advances the action phase only by rolling for the next player", async () => {
    const user = userEvent.setup();
    const onNextRoll = vi.fn();

    render(
      <GameTable
        view={{
          ...view(),
          phaseLabel: "Action phase",
          canRoll: false,
          showNextRoll: true,
          canRollNextTurn: true,
        }}
        onRoll={vi.fn()}
        onAlchemy={vi.fn()}
        onEditPlayer={vi.fn()}
        onNextRoll={onNextRoll}
        onPause={vi.fn()}
        onHistory={vi.fn()}
        onSettings={vi.fn()}
        onExport={vi.fn()}
        onConfirmWinner={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "End turn" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Next: Grace & roll" }),
    );
    expect(onNextRoll).toHaveBeenCalledOnce();
  });

  it("explicitly disables every game control while paused", () => {
    render(
      <GameTable
        view={{
          ...view(),
          paused: true,
          showNextRoll: true,
          canRollNextTurn: true,
          winnerCandidateName: "Ada",
        }}
        onRoll={vi.fn()}
        onAlchemy={vi.fn()}
        onEditPlayer={vi.fn()}
        onNextRoll={vi.fn()}
        onPause={vi.fn()}
        onHistory={vi.fn()}
        onSettings={vi.fn()}
        onExport={vi.fn()}
        onConfirmWinner={vi.fn()}
      />,
    );

    expect(screen.getByText("Paused")).toBeVisible();
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
