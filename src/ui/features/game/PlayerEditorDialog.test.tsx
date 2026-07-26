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
      "Adjust points and improvement levels. Cities, walls and knights live on the physical board.",
    );
    const advanced = screen
      .getByText("City improvements", { selector: "summary" })
      .closest("details");
    expect(advanced).not.toHaveAttribute("open");
    expect(
      screen.getByRole("button", { name: "Increase Point change" }),
    ).toBeVisible();

    await user.click(
      screen.getByText("City improvements", { selector: "summary" }),
    );
    expect(
      screen.getByText(/Improvement levels decide progress-card eligibility/),
    ).toHaveTextContent("Held metropolises: science.");

    await user.click(screen.getByRole("button", { name: "Increase Science" }));
    await user.click(
      screen.getByRole("button", { name: "Increase Point change" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Reason" }),
      "  Longest road  ",
    );

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith({
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
          improvements: { science: 5, trade: 0, politics: 1 },
          metropolisDisciplines: [],
        }}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(
      screen.getByText("City improvements", { selector: "summary" }),
    );
    expect(
      screen.getByRole("button", { name: "Increase Science" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Decrease Trade" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Improvement levels decide progress-card eligibility/),
    ).toHaveTextContent("Held metropolises: none.");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
