interface PlayerMarkerProps {
  color: string;
  label: string;
  size?: "small" | "regular";
}

export function PlayerMarker({
  color,
  label,
  size = "regular",
}: PlayerMarkerProps) {
  return (
    <span className={`player-marker player-marker--${size}`}>
      <span
        className="player-marker__swatch"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}
