import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PwaUpdate } from "./PwaUpdate";

const pwa = vi.hoisted(() => ({
  needRefresh: false,
  offlineReady: false,
  setNeedRefresh: vi.fn(),
  setOfflineReady: vi.fn(),
  updateServiceWorker: vi.fn(),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [pwa.needRefresh, pwa.setNeedRefresh],
    offlineReady: [pwa.offlineReady, pwa.setOfflineReady],
    updateServiceWorker: pwa.updateServiceWorker,
  }),
}));

describe("PwaUpdate", () => {
  beforeEach(() => {
    pwa.needRefresh = false;
    pwa.offlineReady = false;
    pwa.setNeedRefresh.mockReset();
    pwa.setOfflineReady.mockReset();
    pwa.updateServiceWorker.mockReset();
  });

  it("stays hidden when the service worker has no announcement", () => {
    const { container } = render(<PwaUpdate />);
    expect(container).toBeEmptyDOMElement();
  });

  it("gates an update while a game resolution is unsafe and allows dismissal", async () => {
    const user = userEvent.setup();
    pwa.needRefresh = true;

    render(<PwaUpdate safeToUpdate={false} />);

    expect(
      screen.getByText(/will wait until the current resolution is complete/i),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Update now" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Update now" }));
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();
    expect(pwa.setNeedRefresh).toHaveBeenCalledWith(false);
    expect(pwa.setOfflineReady).toHaveBeenCalledWith(false);
  });

  it("applies a safe update and reports offline readiness", async () => {
    const user = userEvent.setup();
    pwa.needRefresh = true;
    const { rerender } = render(<PwaUpdate />);

    await user.click(screen.getByRole("button", { name: "Update now" }));
    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true);

    pwa.needRefresh = false;
    pwa.offlineReady = true;
    rerender(<PwaUpdate />);

    expect(screen.getByText("The companion is ready offline.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Update now" }),
    ).not.toBeInTheDocument();
  });
});
