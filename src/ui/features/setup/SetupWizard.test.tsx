import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { defaultDevicePreferences } from "../../../application/devicePreferences";
import { SetupWizard } from "./SetupWizard";

describe("SetupWizard", () => {
  it("completes a standard four-player setup", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(
      <SetupWizard
        initialPreferences={defaultDevicePreferences}
        onCancel={vi.fn()}
        onStart={onStart}
      />,
    );

    const nameInputs = screen.getAllByPlaceholderText(/Player \d/);
    for (const [index, input] of nameInputs.entries()) {
      await user.type(
        input,
        ["Ada", "Grace", "Linus", "Margaret"][index] ?? "",
      );
    }

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Rules and table events" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Table-device preferences" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Review the table" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Start and save game" }),
    );

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      victoryTarget: 13,
      eventPercent: 8,
      numberedReshuffleThreshold: 0,
    });
  });

  it("rejects duplicate names before leaving the player step", async () => {
    const user = userEvent.setup();

    render(
      <SetupWizard
        initialPreferences={defaultDevicePreferences}
        onCancel={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    const nameInputs = screen.getAllByPlaceholderText(/Player \d/);
    for (const input of nameInputs) {
      await user.type(input, "Ada");
    }
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Player names must be unique.",
    );
  });

  it("calls onCancel when clicking Cancel on the first step", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <SetupWizard
        initialPreferences={defaultDevicePreferences}
        onCancel={onCancel}
        onStart={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("navigates back through steps with the Back button", async () => {
    const user = userEvent.setup();

    render(
      <SetupWizard
        initialPreferences={defaultDevicePreferences}
        onCancel={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    const nameInputs = screen.getAllByPlaceholderText(/Player \d/);
    for (const [index, input] of nameInputs.entries()) {
      await user.type(input, ["A", "B", "C", "D"][index] ?? "");
    }

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Rules and table events" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "Players and turn order" }),
    ).toBeInTheDocument();
  });

  it("rejects empty player names before proceeding", async () => {
    const user = userEvent.setup();

    render(
      <SetupWizard
        initialPreferences={defaultDevicePreferences}
        onCancel={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a name for every player.",
    );
  });

  it("allows adjusting the victory target on the rules step", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(
      <SetupWizard
        initialPreferences={defaultDevicePreferences}
        onCancel={vi.fn()}
        onStart={onStart}
      />,
    );

    const nameInputs = screen.getAllByPlaceholderText(/Player \d/);
    for (const [index, input] of nameInputs.entries()) {
      await user.type(input, ["A", "B", "C", "D"][index] ?? "");
    }
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const victoryInput = screen.getByLabelText("Victory target");
    fireEvent.change(victoryInput, { target: { value: "10" } });

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      screen.getByRole("button", { name: "Start and save game" }),
    );

    expect(onStart.mock.calls[0]?.[0]).toMatchObject({ victoryTarget: 10 });
  });

  it("selects a different event frequency", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(
      <SetupWizard
        initialPreferences={defaultDevicePreferences}
        onCancel={vi.fn()}
        onStart={onStart}
      />,
    );

    const nameInputs = screen.getAllByPlaceholderText(/Player \d/);
    for (const [index, input] of nameInputs.entries()) {
      await user.type(input, ["A", "B", "C", "D"][index] ?? "");
    }
    await user.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.change(screen.getByLabelText("World event frequency percent"), {
      target: { value: "37" },
    });

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      screen.getByRole("button", { name: "Start and save game" }),
    );

    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      eventPercent: 37,
    });
  });

  it("passes an early reshuffle threshold through the draft", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(
      <SetupWizard
        initialPreferences={defaultDevicePreferences}
        onCancel={vi.fn()}
        onStart={onStart}
      />,
    );

    const nameInputs = screen.getAllByPlaceholderText(/Player \d/);
    for (const [index, input] of nameInputs.entries()) {
      await user.type(input, ["A", "B", "C", "D"][index] ?? "");
    }
    await user.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.change(
      screen.getByLabelText("Reshuffle when this many cards remain"),
      { target: { value: "4" } },
    );
    expect(
      screen.getByText(/A new year begins after card 32/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      screen.getByRole("button", { name: "Start and save game" }),
    );

    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      numberedReshuffleThreshold: 4,
    });
  });

  it("reduces the setup to exactly two players in house mode", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(
      <SetupWizard
        initialPreferences={defaultDevicePreferences}
        onCancel={vi.fn()}
        onStart={onStart}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: /Allow two-player house mode/,
      }),
    );
    const nameInputs = screen.getAllByPlaceholderText(/Player \d/);
    expect(nameInputs).toHaveLength(2);
    await user.type(nameInputs[0] as HTMLInputElement, "Ada");
    await user.type(nameInputs[1] as HTMLInputElement, "Grace");

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      screen.getByRole("button", { name: "Start and save game" }),
    );

    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      twoPlayerHouseMode: true,
      players: [{ name: "Ada" }, { name: "Grace" }],
    });
  });

  it("can disable World Events entirely", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(
      <SetupWizard
        initialPreferences={defaultDevicePreferences}
        onCancel={vi.fn()}
        onStart={onStart}
      />,
    );

    for (const [index, input] of screen
      .getAllByPlaceholderText(/Player \d/)
      .entries()) {
      await user.type(input, ["A", "B", "C", "D"][index] ?? "");
    }
    await user.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("World event frequency percent"), {
      target: { value: "0" },
    });

    expect(
      screen.queryByRole("group", { name: "Category packs" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      screen.getByRole("button", { name: "Start and save game" }),
    );

    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      eventPercent: 0,
      worldEventPacks: [],
    });
  });

  it("requires a pack when World Events are enabled", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(
      <SetupWizard
        initialPreferences={defaultDevicePreferences}
        onCancel={vi.fn()}
        onStart={onStart}
      />,
    );

    for (const [index, input] of screen
      .getAllByPlaceholderText(/Player \d/)
      .entries()) {
      await user.type(input, ["A", "B", "C", "D"][index] ?? "");
    }
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const packCheckboxes = screen.getAllByRole("checkbox");
    for (const checkbox of packCheckboxes) {
      await user.click(checkbox);
    }
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Select at least one category pack",
    );

    await user.click(
      screen.getByRole("checkbox", { name: /Weather & Harvest/ }),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      screen.getByRole("button", { name: "Start and save game" }),
    );

    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      eventPercent: 8,
      worldEventPacks: ["nature"],
    });
  });
});
