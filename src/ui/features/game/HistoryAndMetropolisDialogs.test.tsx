import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HistoryDialog } from "./HistoryDialog";
import { MetropolisCorrectionDialog } from "./MetropolisCorrectionDialog";
import { MetropolisDialog } from "./MetropolisDialog";

describe("HistoryDialog", () => {
  it("disables unavailable revisions and renders newest history first", async () => {
    const user = userEvent.setup();
    const onRedo = vi.fn();

    render(
      <HistoryDialog
        open
        canUndo={false}
        canRedo
        entries={[
          {
            id: "one",
            sequence: 1,
            createdAt: "2026-07-12T12:00:00.000Z",
            playerName: "Ada",
            title: "Game created",
            detail: "Created the table.",
            houseRule: false,
            active: false,
          },
          {
            id: "two",
            sequence: 2,
            createdAt: "2026-07-12T12:01:00.000Z",
            playerName: null,
            title: "World event",
            detail: "Harbor Festival completed.",
            houseRule: true,
            active: true,
          },
        ]}
        onUndo={vi.fn()}
        onRedo={onRedo}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Undo latest" })).toBeDisabled();
    const entries = screen.getAllByRole("listitem");
    expect(entries[0]).toHaveTextContent("Revision 2");
    expect(entries[0]).toHaveTextContent("House rule");
    expect(entries[1]).toHaveTextContent("Ada");

    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(onRedo).toHaveBeenCalledOnce();
  });

  it("shows an empty history", () => {
    render(
      <HistoryDialog
        open
        canUndo={false}
        canRedo={false}
        entries={[]}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText("No actions have been recorded yet."),
    ).toBeVisible();
  });
});

describe("MetropolisDialog", () => {
  it("confirms a transfer or rejects it when the physical board differs", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onReject = vi.fn();

    render(
      <MetropolisDialog
        proposal={{
          discipline: "science",
          nextHolder: { id: "ada", name: "Ada", color: "#123456" },
          previousHolder: {
            id: "grace",
            name: "Grace",
            color: "#654321",
          },
          status: "permanent",
        }}
        onConfirm={onConfirm}
        onReject={onReject}
      />,
    );

    expect(screen.getByText("Ada gains permanent control")).toBeVisible();
    expect(
      screen
        .getAllByRole("status")
        .some((status) =>
          status.textContent?.includes("Grace loses temporary control"),
        ),
    ).toBe(true);

    await user.click(
      screen.getByRole("button", { name: "Confirm metropolis" }),
    );
    await user.click(
      screen.getByRole("button", { name: "The physical board differs" }),
    );
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });

  it("describes removal when there is no next holder", () => {
    render(
      <MetropolisDialog
        proposal={{
          discipline: "trade",
          nextHolder: null,
          previousHolder: null,
          status: null,
        }}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(
      screen.getByText("The recorded trade metropolis will be removed."),
    ).toBeVisible();
  });
});

describe("MetropolisCorrectionDialog", () => {
  const players = [
    {
      id: "ada",
      name: "Ada",
      color: "#123456",
      improvements: { science: 3, trade: 5, politics: 4 },
    },
    {
      id: "grace",
      name: "Grace",
      color: "#654321",
      improvements: { science: 4, trade: 2, politics: 1 },
    },
  ];

  it("cautions about a holder below the tracked level but still allows it", async () => {
    // A correction is the operator saying the physical board disagrees with the
    // app, so the app's own tracked level is exactly the thing known to be
    // wrong. Blocking on it would refuse the only command that can repair the
    // disagreement, so it is surfaced as a caution instead.
    const user = userEvent.setup();
    const onPropose = vi.fn();
    render(
      <MetropolisCorrectionDialog
        open
        players={players}
        onPropose={onPropose}
        onClose={vi.fn()}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Recorded holder" }),
      "ada",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ada is recorded at level 3, below the 4 this status normally needs",
    );
    const review = screen.getByRole("button", { name: "Review correction" });
    expect(review).toBeEnabled();

    await user.click(review);
    expect(onPropose).toHaveBeenCalledWith("science", "ada", "temporary");
  });

  it("submits a correction that matches the tracked level without cautioning", async () => {
    const user = userEvent.setup();
    const onPropose = vi.fn();
    render(
      <MetropolisCorrectionDialog
        open
        players={players}
        onPropose={onPropose}
        onClose={vi.fn()}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Recorded holder" }),
      "ada",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Discipline" }),
      "trade",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Control status" }),
      "permanent",
    );
    // Ada is tracked at trade 5, so there is nothing to override here.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review correction" }));

    expect(onPropose).toHaveBeenCalledWith("trade", "ada", "permanent");
  });

  it("can explicitly remove a recorded holder", async () => {
    const user = userEvent.setup();
    const onPropose = vi.fn();
    render(
      <MetropolisCorrectionDialog
        open
        players={players}
        onPropose={onPropose}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Review correction" }));
    expect(onPropose).toHaveBeenCalledWith("science", null, null);
  });
});
