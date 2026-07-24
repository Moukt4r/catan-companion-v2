import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
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
    worldEventPending: false,
    worldEvent: null,
    activeEvents: [],
    winnerCandidateName: null,
  };
}

function renderTable(
  overrides: Partial<GameTableView> = {},
  callbacks: Partial<
    Omit<ComponentProps<typeof GameTable>, "view" | "busy">
  > = {},
) {
  const props: ComponentProps<typeof GameTable> = {
    view: { ...view(), ...overrides },
    onRoll: callbacks.onRoll ?? vi.fn(),
    onAlchemy: callbacks.onAlchemy ?? vi.fn(),
    onAdjustScore: callbacks.onAdjustScore ?? vi.fn(),
    onAcknowledgeEvent: callbacks.onAcknowledgeEvent ?? vi.fn(),
    ...(callbacks.onResolveEvent
      ? { onResolveEvent: callbacks.onResolveEvent }
      : {}),
    onContinueRoll: callbacks.onContinueRoll ?? vi.fn(),
    onEditPlayer: callbacks.onEditPlayer ?? vi.fn(),
    onNextRoll: callbacks.onNextRoll ?? vi.fn(),
    onPause: callbacks.onPause ?? vi.fn(),
    onHistory: callbacks.onHistory ?? vi.fn(),
    onSettings: callbacks.onSettings ?? vi.fn(),
    onExport: callbacks.onExport ?? vi.fn(),
    onConfirmWinner: callbacks.onConfirmWinner ?? vi.fn(),
  };
  return { ...render(<GameTable {...props} />), props };
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

  it("keeps ordinary roll guidance and World Event acknowledgement inline", async () => {
    const user = userEvent.setup();
    const onAcknowledgeEvent = vi.fn();

    render(
      <GameTable
        view={{
          ...view(),
          phaseLabel: "Resolving world event",
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
          worldEventPending: true,
          worldEvent: {
            title: "Harbor Festival",
            instruction: "Announce every maritime trade.",
            tone: "boon",
            toneLabel: "Boon",
            impact: 1,
            category: "society",
            duration: "immediate",
            timingCopy: "Immediate effect",
          },
          activeEvents: [],
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
      screen.getByRole("button", { name: "Acknowledge world event" }),
    );
    expect(onAcknowledgeEvent).toHaveBeenCalledOnce();
  });

  it("shows multiple players and highlights the current one", () => {
    renderTable({
      players: [
        {
          id: "ada",
          name: "Ada",
          color: "#286b9b",
          victoryPoints: 3,
          activeTimeMs: 65_000,
          current: true,
        },
        {
          id: "grace",
          name: "Grace",
          color: "#b43e3e",
          victoryPoints: 5,
          activeTimeMs: 120_000,
          current: false,
        },
      ],
    });

    expect(
      screen.getByLabelText("Ada has 3 public points"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Grace has 5 public points"),
    ).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("shows offline indicator", () => {
    renderTable({ offline: true });
    expect(screen.getByText("Offline")).toBeVisible();
  });

  it("shows production guidance for a robber-activated roll of 7", () => {
    renderTable({
      canRoll: false,
      lastRoll: {
        red: 3,
        yellow: 4,
        total: 7,
        event: "barbarian",
        source: "balanced",
        progress: null,
        production: { robberActivated: true },
      },
    });

    expect(screen.getByText(/move the robber and steal/)).toBeVisible();
  });

  it("shows barbarian ship advance text when no progress", () => {
    renderTable({
      canRoll: false,
      lastRoll: {
        red: 2,
        yellow: 3,
        total: 5,
        event: "barbarian",
        source: "balanced",
        progress: null,
        production: { robberActivated: false },
      },
      barbarian: {
        position: 3,
        trackLength: 7,
        strength: 3,
        defenderStrength: 2,
        attackPending: false,
      },
    });

    expect(screen.getByText(/barbarian ship advanced to 3 of 7/)).toBeVisible();
  });

  it("shows winner candidate banner with confirm button", async () => {
    const user = userEvent.setup();
    const onConfirmWinner = vi.fn();

    renderTable({ winnerCandidateName: "Grace" }, { onConfirmWinner });

    expect(
      screen.getByText(/Grace has reached the victory target/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm winner" }));
    expect(onConfirmWinner).toHaveBeenCalledOnce();
  });

  it("renders alchemy source label in roll result", () => {
    renderTable({
      canRoll: false,
      lastRoll: {
        red: 6,
        yellow: 6,
        total: 12,
        event: "trade",
        source: "alchemy",
        progress: {
          discipline: "trade",
          redValue: 6,
          eligiblePlayers: [],
        },
        production: { robberActivated: false },
      },
    });

    expect(screen.getByText(/Chosen with Alchemy/)).toBeVisible();
  });

  it("shows continue roll button when canContinueRoll is true", async () => {
    const user = userEvent.setup();
    const onContinueRoll = vi.fn();

    renderTable(
      {
        canRoll: false,
        canContinueRoll: true,
        lastRoll: {
          red: 2,
          yellow: 3,
          total: 5,
          event: "science",
          source: "balanced",
          progress: { discipline: "science", redValue: 2, eligiblePlayers: [] },
          production: { robberActivated: false },
        },
      },
      { onContinueRoll },
    );

    const btn = screen.getByRole("button", { name: "Continue roll" });
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(onContinueRoll).toHaveBeenCalledOnce();
  });

  it("presents pending World Event metadata and acknowledgement", async () => {
    const user = userEvent.setup();
    const onAcknowledgeEvent = vi.fn();

    renderTable(
      {
        canRoll: false,
        lastRoll: {
          red: 4,
          yellow: 2,
          total: 6,
          event: "trade",
          source: "balanced",
          progress: {
            discipline: "trade",
            redValue: 4,
            eligiblePlayers: [],
          },
          production: { robberActivated: false },
        },
        worldEventPending: true,
        worldEvent: {
          title: "Trade Winds",
          instruction: "Maritime trade is cheaper.",
          tone: "boon",
          toneLabel: "Boon",
          impact: 2,
          category: "economy",
          duration: "full-round",
          timingCopy: "Activates next round",
        },
      },
      { onAcknowledgeEvent },
    );

    expect(screen.getByText("World Event (house rule)")).toBeVisible();
    expect(screen.getByText("Trade Winds")).toBeVisible();
    expect(screen.getByText("Activates next round")).toBeVisible();
    expect(screen.getByText("2 / 3")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Acknowledge world event" }),
    );
    expect(onAcknowledgeEvent).toHaveBeenCalledOnce();
  });

  it("keeps persistent events visible and resolves only manual events", async () => {
    const user = userEvent.setup();
    const onResolveEvent = vi.fn();

    renderTable(
      {
        activeEvents: [
          {
            occurrenceId: "earthquake-1",
            title: "Earthquake",
            instruction: "Repair every damaged road.",
            tone: "setback",
            impact: 2,
            category: "nature",
            duration: "until-resolved",
            timingCopy: "Active until resolved",
            canResolve: true,
          },
          {
            occurrenceId: "storm-1",
            title: "Storm at Sea",
            instruction: "No maritime trade.",
            tone: "setback",
            impact: 1,
            category: "nature",
            duration: "full-round",
            timingCopy: "Active this round",
            canResolve: false,
          },
        ],
      },
      { onResolveEvent },
    );

    expect(
      screen.getByRole("region", { name: "Active world events" }),
    ).toBeVisible();
    expect(screen.getByText("Storm at Sea")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Mark resolved" }),
    ).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Mark resolved" }));
    expect(onResolveEvent).toHaveBeenCalledWith("earthquake-1");
  });

  it("disables manual event resolution in read-only mode", () => {
    renderTable(
      {
        readOnly: true,
        activeEvents: [
          {
            occurrenceId: "earthquake-1",
            title: "Earthquake",
            instruction: "Repair every damaged road.",
            tone: "setback",
            impact: 2,
            category: "nature",
            duration: "until-resolved",
            timingCopy: "Active until resolved",
            canResolve: true,
          },
        ],
      },
      { onResolveEvent: vi.fn() },
    );

    expect(
      screen.getByRole("button", { name: "Mark resolved" }),
    ).toBeDisabled();
  });
});
