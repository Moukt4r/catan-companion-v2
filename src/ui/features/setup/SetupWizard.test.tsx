import { render, screen } from "@testing-library/react";
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
      eventCadence: "standard",
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
});
