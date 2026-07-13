interface LiveRegionProps {
  message: string;
  assertive?: boolean;
}

export function LiveRegion({ assertive = false, message }: LiveRegionProps) {
  return (
    <div
      className="sr-only"
      aria-live={assertive ? "assertive" : "polite"}
      aria-atomic="true"
    >
      {message}
    </div>
  );
}
