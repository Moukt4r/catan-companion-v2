import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
import { Dialog } from "./Dialog";
import { LiveRegion } from "./LiveRegion";

describe("Dialog", () => {
  it("exposes its title and description and closes from the labelled button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Dialog
        open
        title="Accessible title"
        description="Helpful context"
        closeLabel="Close accessible dialog"
        onClose={onClose}
      >
        <button>Focusable action</button>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Accessible title" });
    expect(dialog).toHaveAccessibleDescription("Helpful context");

    await user.click(
      screen.getByRole("button", { name: "Close accessible dialog" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("prevents keyboard cancellation when closing is disabled", () => {
    const onClose = vi.fn();

    render(
      <Dialog open preventClose title="Required resolution" onClose={onClose}>
        Resolve this first
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Required resolution" });
    const cancelEvent = new Event("cancel", {
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(cancelEvent);

    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
  });

  it("handles native dialog cancellation and close events", () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Dismissible" onClose={onClose}>
        Content
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Dismissible" });
    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
    fireEvent(dialog, new Event("close", { bubbles: true }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("ConfirmDialog", () => {
  it("routes cancel and dangerous confirmation actions", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open
        danger
        title="Delete game?"
        description="This cannot be undone."
        confirmLabel="Delete permanently"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByRole("button", {
      name: "Delete permanently",
    });
    expect(confirm).toHaveClass("button--danger");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(confirm);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("LiveRegion", () => {
  it("announces polite and assertive messages atomically", () => {
    const { rerender } = render(<LiveRegion message="Game saved" />);
    const region = screen.getByText("Game saved");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");

    rerender(<LiveRegion assertive message="Save failed" />);
    expect(screen.getByText("Save failed")).toHaveAttribute(
      "aria-live",
      "assertive",
    );
  });
});
