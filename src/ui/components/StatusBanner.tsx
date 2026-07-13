import type { ReactNode } from "react";

interface StatusBannerProps {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
  role?: "status" | "alert";
}

export function StatusBanner({
  children,
  role = "status",
  tone = "info",
}: StatusBannerProps) {
  return (
    <div className={`status-banner status-banner--${tone}`} role={role}>
      {children}
    </div>
  );
}
