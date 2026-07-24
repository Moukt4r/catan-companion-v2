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
    canContinueRoll: false,
    showNextRoll: false,
    canRollNextTurn: false,
    canEditPublicState: false,
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
      attackPending: false,
    },
    players: [
      {
        id: "ada",
        name: "Ada",
        color: "#286b9b",
        victoryPoints: 3,
        activeTimeMs: 65_000,
        current: true,
      },
    ],
    houseEventPending: false,
    houseEvent: null,
    winnerCandidateName: null,
  };
}

describe("GameTable", () => {
  it("offers the primary roll action and compact player summary", async () => {
    const user = userEvent.setup();
    const onRoll = vi.fn();

    const { container } = render(
      <GameTable
        view={view()}
        onRoll={onRoll}
        onAlchemy={vi.fn()}
        onAdjustScore={vi.fn()}
        onAcknowledgeEvent={vi.fn()}
        onContinueRoll={vi.fn()}
        onEditPlayer={vi.fn()}
        onNextRoll={vi.fn()}
        onPause={vi.fn()}
        onHistory={vi.fn()}
        onSettings={vi.fn()}
        onExport={vi.fn()}
        onConfirmWinner={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Roll" }));

    expect(onRoll).toHaveBeenCalledOnce();
    expect(screen.getAllByText("00:01:05")).toHaveLength(2);
    expect(screen.getByText("01:01:01")).toBeVisible();
    expect(screen.getByLabelText("Ada has 3 public points")).toHaveTextContent(
      "3",
    );
    expect(screen.queryByText("Cities")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Increase Ada points" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("meter", {
        name: "7 spaces until the barbarian attack",
      }),
    ).toBeInTheDocument();
    expect(container.querySelector(".barbarian-details")).toHaveAttribute(
      "open",
    );
    expect(container.querySelector(".barbarian-summary")).toHaveTextContent(
      "7 spaces until attack",
    );
  });

  it("offers one-tap score changes and detailed editing in the action phase", async () => {
    const user = userEvent.setup();
    const onAdjustScore = vi.fn();
    const onEditPlayer = vi.fn();

    render(
      <GameTable
        view={{
          ...view(),
          phaseLabel: "Action phase",
          canRoll: false,
          canEditPublicState: true,
        }}
        onRoll={vi.fn()}
        onAlchemy={vi.fn()}
        onAdjustScore={onAdjustScore}
        onAcknowledgeEvent={vi.fn()}
        onContinueRoll={vi.fn()}
        onEditPlayer={onEditPlayer}
        onNextRoll={vi.fn()}
        onPause={vi.fn()}
        onHistory={vi.fn()}
        onSettings={vi.fn()}
        onExport={vi.fn()}
        onConfirmWinner={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Increase Ada points" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Decrease Ada points" }),
    );
    await user.click(screen.getByRole("button", { name: "Edit Ada details" }));

    expect(onAdjustScore).toHaveBeenNthCalledWith(1, "ada", 1);
    expect(onAdjustScore).toHaveBeenNthCalledWith(2, "ada", -1);
    expect(onEditPlayer).toHaveBeenCalledWith("ada");
  });

  it("disables every state-changing table control in read-only mode", () => {
    render(
      <GameTable
        view={{
          ...view(),
          readOnly: true,
          showNextRoll: true,
          canRollNextTurn: true,
          canEditPublicState: true,
          winnerCandidateName: "Ada",
        }}
        onRoll={vi.fn()}
        onAlchemy={vi.fn()}
        onAdjustScore={vi.fn()}
        onAcknowledgeEvent={vi.fn()}
        onContinueRoll={vi.fn()}
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
      screen.getByRole("button", { name: "Increase Ada points" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Edit Ada details" }),
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
          canEditPublicState: true,
        }}
        onRoll={vi.fn()}
        onAlchemy={vi.fn()}
        onAdjustScore={vi.fn()}
        onAcknowledgeEvent={vi.fn()}
        onContinueRoll={vi.fn()}
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
          canEditPublicState: true,
          winnerCandidateName: "Ada",
        }}
        onRoll={vi.fn()}
        onAlchemy={vi.fn()}
        onAdjustScore={vi.fn()}
        onAcknowledgeEvent={vi.fn()}
        onContinueRoll={vi.fn()}
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

  it("keeps ordinary roll guidance and house-event acknowledgement inline", async () => {
    const user = userEvent.setup();
    const onAcknowledgeEvent = vi.fn();

    render(
      <GameTable
        view={{
          ...view(),
          phaseLabel: "Resolving house event",
          canRoll: false,
          lastRoll: {
            red: 4,
            yellow: 3,
            total: 7,
            event: "science",
            source: "balanced",
            progress: {
              discipline: "science",
              redValue: 4,
              eligiblePlayers: [{ id: "ada", name: "Ada" }],
            },
            production: {
              robberActivated: false,
            },
          },
          houseEventPending: true,
          houseEvent: {
            title: "Harbor Festival",
            instruction: "Announce every maritime trade.",
          },
        }}
        onRoll={vi.fn()}
        onAlchemy={vi.fn()}
        onAdjustScore={vi.fn()}
        onAcknowledgeEvent={onAcknowledgeEvent}
        onContinueRoll={vi.fn()}
        onEditPlayer={vi.fn()}
        onNextRoll={vi.fn()}
        onPause={vi.fn()}
        onHistory={vi.fn()}
        onSettings={vi.fn()}
        onExport={vi.fn()}
        onConfirmWinner={vi.fn()}
      />,
    );

    expect(screen.getByText(/Science progress with red 4/)).toBeVisible();
    expect(screen.getByText(/robber stays inactive/)).toBeVisible();
    expect(screen.getByText("Harbor Festival")).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: /Roll result:/ }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Acknowledge house event" }),
    );
    expect(onAcknowledgeEvent).toHaveBeenCalledOnce();
  });
});
