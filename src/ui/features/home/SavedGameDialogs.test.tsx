import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CompletedGamesDialog } from "./CompletedGamesDialog";
import { ImportPreviewDialog } from "./ImportPreviewDialog";

describe("CompletedGamesDialog", () => {
  it("shows the empty state", () => {
    render(
      <CompletedGamesDialog
        open
        games={[]}
        onResume={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No games have been completed on this device yet."),
    ).toBeInTheDocument();
  });

  it("labels saved games and routes each card action by id", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    const onExport = vi.fn();
    const onDelete = vi.fn();

    render(
      <CompletedGamesDialog
        open
        games={[
          {
            id: "complete",
            title: "Championship",
            status: "completed",
            winnerName: "Ada",
            winnerColor: "#123456",
            currentPlayerName: "Grace",
            currentPlayerColor: "#654321",
            updatedAt: "2026-07-12T12:00:00.000Z",
            rounds: 8,
            turns: 22,
            playerNames: ["Ada", "Grace"],
          },
          {
            id: "archived",
            title: "Paused table",
            status: "archived",
            currentPlayerName: "Linus",
            currentPlayerColor: "#abcdef",
            updatedAt: "2026-07-11T12:00:00.000Z",
            rounds: 3,
            turns: 9,
            playerNames: ["Linus", "Margaret"],
          },
        ]}
        onResume={onResume}
        onExport={onExport}
        onDelete={onDelete}
        onClose={vi.fn()}
      />,
    );

    const completedCard = screen
      .getByRole("heading", { name: "Championship" })
      .closest("article");
    const archivedCard = screen
      .getByRole("heading", { name: "Paused table" })
      .closest("article");
    expect(completedCard).not.toBeNull();
    expect(archivedCard).not.toBeNull();

    await user.click(
      within(completedCard as HTMLElement).getByRole("button", {
        name: "View summary",
      }),
    );
    await user.click(
      within(archivedCard as HTMLElement).getByRole("button", {
        name: "Resume",
      }),
    );
    await user.click(
      within(archivedCard as HTMLElement).getByRole("button", {
        name: "Export",
      }),
    );
    await user.click(
      within(completedCard as HTMLElement).getByRole("button", {
        name: "Delete",
      }),
    );

    expect(screen.getByText("Ada won")).toBeInTheDocument();
    expect(screen.getByText("Linus's turn")).toBeInTheDocument();
    expect(onResume.mock.calls).toEqual([["complete"], ["archived"]]);
    expect(onExport).toHaveBeenCalledWith("archived");
    expect(onDelete).toHaveBeenCalledWith("complete");
  });
});

describe("ImportPreviewDialog", () => {
  it("renders nothing without a validated preview", () => {
    const { container } = render(
      <ImportPreviewDialog
        open
        preview={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("presents validated metadata and confirms or cancels import", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ImportPreviewDialog
        open
        preview={{
          title: "Imported table",
          players: ["Ada", "Grace"],
          turns: 14,
          updatedAt: "2026-07-12T12:00:00.000Z",
          sourceVersion: "1.2.3",
          status: "Active",
        }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Import game backup" }),
    ).toHaveAccessibleDescription(
      "The backup has passed schema and integrity checks.",
    );
    expect(screen.getByText("Ada, Grace")).toBeInTheDocument();
    expect(screen.getByText("1.2.3")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Import as new local game" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
