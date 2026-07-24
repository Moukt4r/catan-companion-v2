import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HomeScreen } from "./HomeScreen";

function activeGame() {
  return {
    id: "game-1",
    title: "Sunday game",
    currentPlayerName: "Ada",
    currentPlayerColor: "#286b9b",
    round: 3,
    updatedAt: "2026-07-12T12:00:00.000Z",
    players: ["Ada", "Grace", "Linus"],
  };
}

function renderHome(overrides: Partial<Parameters<typeof HomeScreen>[0]> = {}) {
  const props = {
    activeGame: activeGame(),
    archivedCount: 2,
    loading: false,
    error: null,
    onResume: vi.fn(),
    onNewGame: vi.fn(),
    onImport: vi.fn(),
    onSettings: vi.fn(),
    onViewArchive: vi.fn(),
    ...overrides,
  };
  return { ...render(<HomeScreen {...props} />), props };
}

describe("HomeScreen", () => {
  it("resumes an active game", async () => {
    const user = userEvent.setup();

    const { props } = renderHome();

    await user.click(screen.getByRole("button", { name: "Resume game" }));

    expect(props.onResume).toHaveBeenCalledOnce();
  });

  it("shows the empty state with 'Start new game' when no active game", () => {
    renderHome({ activeGame: null });

    expect(
      screen.getByRole("heading", { name: "Start a new table" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start new game" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Resume game" }),
    ).not.toBeInTheDocument();
  });

  it("shows loading state and hides game cards", () => {
    renderHome({ activeGame: null, loading: true });

    expect(screen.getByText("Loading saved games")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start new game" }),
    ).not.toBeInTheDocument();
  });

  it("renders an error banner", () => {
    renderHome({ error: "Database corrupted" });

    expect(screen.getByRole("alert")).toHaveTextContent("Database corrupted");
  });

  it("offers 'Start another game' when an active game exists", async () => {
    const user = userEvent.setup();
    const { props } = renderHome();

    await user.click(
      screen.getByRole("button", { name: "Start another game" }),
    );
    expect(props.onNewGame).toHaveBeenCalledOnce();
  });

  it("shows archived count in the saved-games action", () => {
    renderHome({ archivedCount: 5 });

    expect(
      screen.getByText(/5 archived or completed games/),
    ).toBeInTheDocument();
  });

  it("opens settings via device settings button", async () => {
    const user = userEvent.setup();
    const { props } = renderHome();

    await user.click(screen.getByRole("button", { name: "Device settings" }));
    expect(props.onSettings).toHaveBeenCalledOnce();
  });

  it("triggers import callback when a file is selected", async () => {
    const { props } = renderHome();

    const input = screen.getByLabelText("Import game backup file");
    const file = new File(['{"test":true}'], "backup.json", {
      type: "application/json",
    });
    await userEvent.upload(input, file);

    expect(props.onImport).toHaveBeenCalledOnce();
  });

  it("opens the saved games view", async () => {
    const user = userEvent.setup();
    const { props } = renderHome();

    await user.click(screen.getByText("Saved games").closest("button")!);
    expect(props.onViewArchive).toHaveBeenCalledOnce();
  });
});
