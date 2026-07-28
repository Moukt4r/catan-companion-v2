import type { ReactNode, Ref } from "react";

interface StatusBannerProps {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
  role?: "status" | "alert";
  /**
   * Lets a caller move focus or scroll to the banner. A validation message that
   * renders above a long form is useless to a sighted user if nothing brings it
   * into view.
   */
  ref?: Ref<HTMLDivElement>;
  tabIndex?: number;
}

export function StatusBanner({
  children,
  ref,
  role = "status",
  tabIndex,
  tone = "info",
}: StatusBannerProps) {
  return (
    <div
      className={`status-banner status-banner--${tone}`}
      role={role}
      ref={ref}
      tabIndex={tabIndex}
    >
      {children}
    </div>
  );
}
