import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BarbarianAttackDialog } from "./BarbarianAttackDialog";

describe("BarbarianAttackDialog", () => {
  it("requires every tied defender to choose a progress deck", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <BarbarianAttackDialog
        attack={{
          proposalId: "proposal-1",
          barbarianStrength: 3,
          defenderStrength: 4,
          outcome: "defenders-win",
          players: [
            {
              id: "ada",
              name: "Ada",
              color: "#286b9b",
              ordinaryCities: 1,
              metropolises: 0,
              activeKnights: "1 strong",
              activeStrength: 2,
            },
            {
              id: "grace",
              name: "Grace",
              color: "#b43e3e",
              ordinaryCities: 1,
              metropolises: 0,
              activeKnights: "1 strong",
              activeStrength: 2,
            },
          ],
          uniqueDefenderId: null,
          tiedDefenderIds: ["ada", "grace"],
          pillagedPlayerIds: [],
          firstAttack: true,
        }}
        onEditPlayer={vi.fn()}
        onCancelToCorrect={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByRole("button", {
      name: "Confirm attack outcome",
    });
    expect(confirm).toBeDisabled();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Ada's progress deck" }),
      "science",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Grace's progress deck" }),
      "trade",
    );
    await user.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith([
      {
        playerId: "ada",
        discipline: "science",
      },
      {
        playerId: "grace",
        discipline: "trade",
      },
    ]);
  });
});
