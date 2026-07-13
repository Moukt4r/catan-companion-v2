import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AlchemyDialog } from "./AlchemyDialog";
import { ProductionResolutionDialog } from "./ProductionResolutionDialog";
import { ProgressResolutionDialog } from "./ProgressResolutionDialog";
import { ThematicEventDialog } from "./ThematicEventDialog";

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

describe("ProgressResolutionDialog", () => {
  it("lists eligible players in draw order and requires acknowledgement", async () => {
    const user = userEvent.setup();
    const onAcknowledge = vi.fn();

    render(
      <ProgressResolutionDialog
        open
        discipline="science"
        redValue={4}
        eligiblePlayers={[
          {
            id: "ada",
            name: "Ada",
            color: "#123456",
            level: 3,
            eligibleRange: "1, 2, 3, 4",
          },
          {
            id: "grace",
            name: "Grace",
            color: "#654321",
            level: 5,
            eligibleRange: "1, 2, 3, 4, 5, 6",
          },
        ]}
        onAcknowledge={onAcknowledge}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Science progress" });
    expect(dialog).toHaveAccessibleDescription(
      "The red die is 4. Draw in current-player order.",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Mark progress resolved" }),
    );
    expect(onAcknowledge).toHaveBeenCalledOnce();
  });

  it("explains when no player is eligible", () => {
    render(
      <ProgressResolutionDialog
        open
        discipline="trade"
        redValue={6}
        eligiblePlayers={[]}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "No recorded player is eligible for this progress card.",
      ),
    ).toBeInTheDocument();
  });
});

describe("ProductionResolutionDialog", () => {
  it("distinguishes inactive and active robber resolution from production", async () => {
    const user = userEvent.setup();
    const onAcknowledge = vi.fn();
    const { rerender } = render(
      <ProductionResolutionDialog
        open
        total={7}
        robberActivated={false}
        onAcknowledge={onAcknowledge}
      />,
    );

    expect(
      screen.getByText(
        /robber is not active until the first barbarian attack/i,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark 7 resolved" }));

    rerender(
      <ProductionResolutionDialog
        open
        total={7}
        robberActivated
        onAcknowledge={onAcknowledge}
      />,
    );
    expect(
      screen.getByText(/move the robber and steal as normal/i),
    ).toBeVisible();

    rerender(
      <ProductionResolutionDialog
        open
        total={8}
        robberActivated
        onAcknowledge={onAcknowledge}
      />,
    );
    expect(
      screen.getByRole("dialog", { name: "Resolve production 8" }),
    ).toHaveAccessibleDescription(
      "Distribute resources and commodities at the physical board.",
    );
    expect(
      screen.getByText(/resolve hex production for total 8/i),
    ).toBeVisible();
    expect(onAcknowledge).toHaveBeenCalledOnce();
  });
});

describe("ThematicEventDialog", () => {
  it("announces the event category and completes the required table action", async () => {
    const user = userEvent.setup();
    const onAcknowledge = vi.fn();

    render(
      <ThematicEventDialog
        open
        title="Harbor Festival"
        category="Trade"
        instruction="Announce every maritime trade."
        onAcknowledge={onAcknowledge}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Harbor Festival" }),
    ).toHaveAccessibleDescription("Trade table event");
    expect(screen.getByText("Announce every maritime trade.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Event completed" }));
    expect(onAcknowledge).toHaveBeenCalledOnce();
  });
});
