import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { asBoardDesignId, asIsoTimestamp } from "../../../domain";
import { BoardDesignLibraryScreen } from "./BoardDesignLibraryScreen";

describe("BoardDesignLibraryScreen", () => {
  it("creates and opens local board designs", async () => {
    const user = userEvent.setup();
    const onCreateClassic = vi.fn();
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    const id = asBoardDesignId("board-1");

    render(
      <BoardDesignLibraryScreen
        designs={[
          {
            id,
            revision: 0,
            name: "Wild coast",
            updatedAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
            hexCount: 37,
            issueCount: 1,
          },
        ]}
        loading={false}
        error={null}
        onBack={vi.fn()}
        onCreateClassic={onCreateClassic}
        onCreateBlank={vi.fn()}
        onOpen={onOpen}
        onDuplicate={vi.fn()}
        onDelete={onDelete}
        onImport={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Start default board" }),
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onCreateClassic).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith(id);
    expect(onDelete).toHaveBeenCalledWith(id, 0);
    expect(screen.getByText(/1 checks need review/)).toBeInTheDocument();
  });

  it("passes selected JSON files to the importer", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    render(
      <BoardDesignLibraryScreen
        designs={[]}
        loading={false}
        error={null}
        onBack={vi.fn()}
        onCreateClassic={vi.fn()}
        onCreateBlank={vi.fn()}
        onOpen={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onImport={onImport}
      />,
    );
    const file = new File(["{}"], "board.json", {
      type: "application/json",
    });

    await user.upload(screen.getByLabelText("Import board design file"), file);

    expect(onImport).toHaveBeenCalledWith(file);
  });
});
