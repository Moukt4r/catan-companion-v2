import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import "fake-indexeddb/auto";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
}

if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
}

// jsdom has no layout engine, so scrolling is a no-op rather than a feature.
// Components legitimately call this to bring validation messages into view.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* no layout in jsdom */
  };
}
