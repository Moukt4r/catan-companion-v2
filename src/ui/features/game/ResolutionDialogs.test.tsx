import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AlchemyDialog } from "./AlchemyDialog";
import {
  RollResolutionDialog,
  type RollResolutionView,
} from "./RollResolutionDialog";

function baseView(): RollResolutionView {
  return {
    currentPlayerName: "Ada",
    nextPlayerName: "Grace",
    currentTurnMs: 65_000,
    totalGameMs: 3_661_000,
    roll: {
      red: 4,
      yellow: 3,
      total: 7,
      event: "science",
      source: "balanced",
    },
    progress: {
      discipline: "science",
      redValue: 4,
      eligiblePlayers: [
        {
          id: "ada",
          name: "Ada",
          color: "#123456",
          level: 3,
          eligibleRange: "1, 2, 3, 4",
        },
      ],
    },
    production: {
      total: 7,
      robberActivated: false,
    },
    barbarian: {
      position: 2,
      trackLength: 7,
    },
    attack: null,
  };
}

describe("AlchemyDialog", () => {
  it("updates both labelled dice, reports the total, and confirms the choice", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(<AlchemyDialog open onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Increase Red die" }));
    await user.click(
      screen.getByRole("button", { name: "Decrease Yellow die" }),
    );

    expect(screen.getByRole("spinbutton", { name: "Red die" })).toHaveValue(4);
    expect(screen.getByRole("spinbutton", { name: "Yellow die" })).toHaveValue(
      3,
    );
    expect(screen.getByText("Production total:")).toHaveTextContent(
      "Production total: 7",
    );

    await user.click(screen.getByRole("button", { name: "Roll event die" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalledWith(4, 3);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("RollResolutionDialog", () => {
  it("shows every roll consequence in one modal and continues the current turn", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    const { container } = render(
      <RollResolutionDialog
        open
        view={baseView()}
        busy={false}
        onPause={vi.fn()}
        onContinue={onContinue}
        onQuickRoll={vi.fn()}
      />,
    );

    expect(
      container.querySelector(".resolution-event-visual img"),
    ).toHaveAttribute("alt", "");
    expect(
      Array.from(container.querySelectorAll(".resolution-dice .die")).map(
        (die) => die.getAttribute("aria-label"),
      ),
    ).toEqual(["Yellow die: 3", "Red die: 4", "Event die: Science"]);
    expect(
      Array.from(
        container.querySelectorAll(".resolution-dice .event-dice-pair .die"),
      ).map((die) => die.getAttribute("aria-label")),
    ).toEqual(["Red die: 4", "Event die: Science"]);
    expect(
      screen.getByRole("dialog", { name: "Roll result: 7" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Science", { selector: "h3" })).toBeVisible();
    expect(screen.getByText("Ada", { exact: true })).toBeVisible();
    expect(screen.getByText(/Discard above the safe hand limit/)).toBeVisible();
    expect(screen.getByText("00:01:05")).toBeVisible();
    expect(screen.getByText("01:01:01")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Mark progress resolved" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Continue current turn" }),
    );
    expect(onContinue).toHaveBeenCalledWith(null);
  });

  it("offers a quick next-player roll from the same modal", async () => {
    const user = userEvent.setup();
    const onQuickRoll = vi.fn();
    const onPause = vi.fn();

    render(
      <RollResolutionDialog
        open
        view={baseView()}
        busy={false}
        onPause={onPause}
        onContinue={vi.fn()}
        onQuickRoll={onQuickRoll}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Next: Grace",
      }),
    );
    expect(onQuickRoll).toHaveBeenCalledWith(null);
    await user.click(screen.getByRole("button", { name: "Pause game" }));
    expect(onPause).toHaveBeenCalledOnce();
  });

  it("collects manual defender choices before either action is available", async () => {
    const user = userEvent.setup();
    const onQuickRoll = vi.fn();
    const view: RollResolutionView = {
      ...baseView(),
      roll: {
        ...baseView().roll,
        event: "barbarian",
      },
      progress: null,
      attack: {
        proposalId: "attack-1",
        players: [
          {
            id: "ada",
            name: "Ada",
            color: "#123456",
            ordinaryCities: 1,
            metropolises: 0,
          },
          {
            id: "grace",
            name: "Grace",
            color: "#654321",
            ordinaryCities: 1,
            metropolises: 0,
          },
        ],
        firstAttack: true,
      },
    };

    render(
      <RollResolutionDialog
        open
        view={view}
        busy={false}
        onPause={vi.fn()}
        onContinue={vi.fn()}
        onQuickRoll={onQuickRoll}
      />,
    );

    const quickRoll = screen.getByRole("button", {
      name: "Next: Grace",
    });
    expect(quickRoll).toBeDisabled();

    // Choose defenders won
    await user.click(screen.getByLabelText("Defenders won"));
    expect(quickRoll).toBeDisabled();

    // Choose tied contributors
    await user.click(
      screen.getByLabelText("Tied contributors (progress deck each)"),
    );
    expect(quickRoll).toBeDisabled();

    // Select two tied defenders
    await user.click(screen.getByLabelText("Ada"));
    await user.click(screen.getByLabelText("Grace"));

    // Still disabled until progress choices are made
    expect(quickRoll).toBeDisabled();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Ada's progress deck" }),
      "science",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Grace's progress deck" }),
      "trade",
    );
    await user.click(quickRoll);

    expect(onQuickRoll).toHaveBeenCalledWith({
      type: "defenders-win",
      reward: {
        type: "progress-choice",
        playerIds: ["ada", "grace"],
        choices: [
          { playerId: "ada", discipline: "science" },
          { playerId: "grace", discipline: "trade" },
        ],
      },
    });
  });

  it("disables modal actions while the consolidated result is saving", () => {
    render(
      <RollResolutionDialog
        open
        view={baseView()}
        busy
        onPause={vi.fn()}
        onContinue={vi.fn()}
        onQuickRoll={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Continue current turn" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });
});
