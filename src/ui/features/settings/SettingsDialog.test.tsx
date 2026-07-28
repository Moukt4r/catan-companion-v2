import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";

const preferences = {
  theme: "system" as const,
  motion: "system" as const,
  soundEnabled: false,
  soundVolume: 0.55,
  soundPack: "workshop" as const,
  diceRollMs: 650 as const,
  keepAwake: false,
};

function renderSettings(
  overrides: Partial<ComponentProps<typeof SettingsDialog>> = {},
) {
  const props: ComponentProps<typeof SettingsDialog> = {
    open: true,
    preferences,
    reducedMotion: false,
    storageStatus: null,
    appVersion: "test",
    schemaVersion: 1,
    onChange: vi.fn(),
    onPreviewSound: vi.fn(),
    onRequestPersistentStorage: vi.fn().mockResolvedValue(undefined),
    onCopyDiagnostics: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<SettingsDialog {...props} />), props };
}

describe("SettingsDialog", () => {
  it("updates accessible device preferences and invokes storage actions", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onRequestPersistentStorage = vi.fn().mockResolvedValue(undefined);
    const onCopyDiagnostics = vi.fn().mockResolvedValue(undefined);

    renderSettings({
      storageStatus: {
        persisted: false,
        usage: 512 * 1024,
        quota: 2.5 * 1024 * 1024,
      },
      appVersion: "2.4.0",
      schemaVersion: 7,
      onChange,
      onRequestPersistentStorage,
      onCopyDiagnostics,
    });

    await user.selectOptions(screen.getByRole("combobox", { name: "Theme" }), [
      "dark",
    ]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Motion" }), [
      "reduced",
    ]);
    await user.click(screen.getByRole("checkbox", { name: /sound effects/i }));
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

  it("offers persisted volume and an explicit sound preview", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onPreviewSound = vi.fn();

    renderSettings({
      preferences: { ...preferences, soundEnabled: true, soundVolume: 0.7 },
      onChange,
      onPreviewSound,
    });

    const volume = screen.getByRole("slider", { name: "Sound volume" });
    expect(volume).toHaveValue("0.7");
    expect(screen.getByText("70%")).toBeVisible();
    fireEvent.change(volume, { target: { value: "0.75" } });
    await user.click(screen.getByRole("button", { name: "Preview sound" }));

    expect(onChange).toHaveBeenCalledWith({ soundVolume: 0.75 });
    expect(onPreviewSound).toHaveBeenCalledOnce();
  });

  it("shows loading and protected-storage states without an unnecessary action", () => {
    const { rerender, props } = renderSettings();

    expect(
      screen.getByText(/storage details will appear/i),
    ).toBeInTheDocument();

    rerender(
      <SettingsDialog
        {...props}
        storageStatus={{ persisted: true, usage: null, quota: null }}
      />,
    );

    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Protect saved games" }),
    ).not.toBeInTheDocument();
  });

  it("disables roll speed whenever motion is actually reduced", () => {
    // "system" plus an OS that asks for reduced motion is still reduced. The
    // control used to read the stored literal, so it stayed enabled and its
    // hint promised a tumble the table had asked not to see.
    renderSettings({
      preferences: { ...preferences, motion: "system" },
      reducedMotion: true,
    });

    expect(
      screen.getByRole("combobox", { name: "Dice roll speed" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Reduced motion shows the result immediately/),
    ).toBeVisible();
  });

  it("cannot preview a pack that plays nothing", () => {
    // Silent has nothing to preview. Left clickable it looked broken rather
    // than quiet: a table testing packs clicks it and concludes sound is dead.
    renderSettings({
      preferences: {
        ...preferences,
        soundEnabled: true,
        soundPack: "silent",
      },
    });

    expect(
      screen.getByRole("button", { name: "Preview sound" }),
    ).toBeDisabled();
  });

  it("can preview a pack that makes sound", () => {
    renderSettings({
      preferences: {
        ...preferences,
        soundEnabled: true,
        soundPack: "workshop",
      },
    });

    expect(screen.getByRole("button", { name: "Preview sound" })).toBeEnabled();
  });

  it("keeps roll speed available when motion is not reduced", () => {
    renderSettings({
      preferences: { ...preferences, motion: "system" },
      reducedMotion: false,
    });

    expect(
      screen.getByRole("combobox", { name: "Dice roll speed" }),
    ).toBeEnabled();
    expect(screen.getByText(/How long the dice tumble/)).toBeVisible();
  });
});
