import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";

const preferences = {
  theme: "system" as const,
  motion: "system" as const,
  soundEnabled: false,
  keepAwake: false,
};

describe("SettingsDialog", () => {
  it("updates accessible device preferences and invokes storage actions", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onRequestPersistentStorage = vi.fn().mockResolvedValue(undefined);
    const onCopyDiagnostics = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsDialog
        open
        preferences={preferences}
        storageStatus={{
          persisted: false,
          usage: 512 * 1024,
          quota: 2.5 * 1024 * 1024,
        }}
        appVersion="2.4.0"
        schemaVersion={7}
        onChange={onChange}
        onRequestPersistentStorage={onRequestPersistentStorage}
        onCopyDiagnostics={onCopyDiagnostics}
        onClose={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Theme" }), [
      "dark",
    ]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Motion" }), [
      "reduced",
    ]);
    await user.click(screen.getByRole("checkbox", { name: /sound cues/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /keep screen awake/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Protect saved games" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Copy sanitized diagnostics" }),
    );

    expect(onChange.mock.calls).toEqual([
      [{ theme: "dark" }],
      [{ motion: "reduced" }],
      [{ soundEnabled: true }],
      [{ keepAwake: true }],
    ]);
    expect(screen.getByText("512 KB")).toBeInTheDocument();
    expect(screen.getByText("2.5 MB")).toBeInTheDocument();
    expect(screen.getByText("2.4.0")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(onRequestPersistentStorage).toHaveBeenCalledOnce();
    expect(onCopyDiagnostics).toHaveBeenCalledOnce();
  });

  it("shows loading and protected-storage states without an unnecessary action", () => {
    const { rerender } = render(
      <SettingsDialog
        open
        preferences={preferences}
        storageStatus={null}
        appVersion="test"
        schemaVersion={1}
        onChange={vi.fn()}
        onRequestPersistentStorage={vi.fn()}
        onCopyDiagnostics={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/storage details will appear/i),
    ).toBeInTheDocument();

    rerender(
      <SettingsDialog
        open
        preferences={preferences}
        storageStatus={{ persisted: true, usage: null, quota: null }}
        appVersion="test"
        schemaVersion={1}
        onChange={vi.fn()}
        onRequestPersistentStorage={vi.fn()}
        onCopyDiagnostics={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Protect saved games" }),
    ).not.toBeInTheDocument();
  });
});
