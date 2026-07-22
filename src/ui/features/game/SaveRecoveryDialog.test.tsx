import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SaveRecoveryDialog } from "./SaveRecoveryDialog";

describe("SaveRecoveryDialog", () => {
  it("blocks dismissal and exposes every recovery action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onExport = vi.fn();
    const onRevert = vi.fn();

    render(
      <SaveRecoveryDialog
        open
        message="Storage failed."
        busy={false}
        onRetry={onRetry}
        onExport={onExport}
        onRevert={onRevert}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Save not confirmed" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry save" }));
    await user.click(
      screen.getByRole("button", { name: "Export emergency backup" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Revert unsaved action" }),
    );

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onExport).toHaveBeenCalledOnce();
    expect(onRevert).toHaveBeenCalledOnce();
  });
});
