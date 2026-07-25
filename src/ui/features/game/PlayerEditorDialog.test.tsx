import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  PlayerEditorDialog,
  type PlayerEditorValue,
} from "./PlayerEditorDialog";

const player: PlayerEditorValue = {
  id: "ada",
  name: "Ada",
  color: "#123456",
  victoryPoints: 6,
  ordinaryCities: 1,
  cityWalls: 0,
  safeHandLimit: 7,
  activeKnights: { basic: 1, strong: 0, mighty: 0 },
  inactiveKnights: { basic: 0, strong: 0, mighty: 0 },
  improvements: { science: 3, trade: 2, politics: 1 },
  metropolisDisciplines: ["science"],
};

describe("PlayerEditorDialog", () => {
  it("saves edited public state with a trimmed score reason", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <PlayerEditorDialog player={player} onSave={onSave} onClose={vi.fn()} />,
    );

    expect(
      screen.getByRole("dialog", { name: "Edit Ada" }),
    ).toHaveAccessibleDescription(
      "Adjust points first. Cities and Knights details are available when needed, and every saved change appears in history.",
    );
    const advanced = screen
      .getByText("Advanced Cities & Knights state")
      .closest("details");
    expect(advanced).not.toHaveAttribute("open");
    expect(
      screen.getByRole("button", { name: "Increase Point change" }),
    ).toBeVisible();

    await user.click(screen.getByText("Advanced Cities & Knights state"));
    expect(
      screen.getByText(/Metropolises are tracked by discipline/),
    ).toHaveTextContent("Held: science.");
    expect(screen.getByText("Strength 1")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Increase Ordinary cities" }),
    );
    await user.click(screen.getByRole("button", { name: "Increase Strong" }));
    await user.click(screen.getByRole("button", { name: "Increase Science" }));
    await user.click(
      screen.getByRole("button", { name: "Increase Point change" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Reason" }),
      "  Longest road  ",
    );

    expect(screen.getByText("Strength 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith({
      ordinaryCities: 2,
      cityWalls: 0,
      activeKnights: { basic: 1, strong: 1, mighty: 0 },
      inactiveKnights: { basic: 0, strong: 0, mighty: 0 },
      improvements: { science: 4, trade: 2, politics: 1 },
      scoreDelta: 1,
      scoreNote: "Longest road",
    });
  });

  it("exposes keyboard-labelled bounds and cancel behavior", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PlayerEditorDialog
        player={{
          ...player,
          ordinaryCities: 4,
          activeKnights: { basic: 0, strong: 0, mighty: 0 },
          metropolisDisciplines: [],
        }}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByText("Advanced Cities & Knights state"));
    expect(
      screen.getByRole("button", { name: "Increase Ordinary cities" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Decrease Basic" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Metropolises are tracked by discipline/),
    ).toHaveTextContent("Held: none.");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
