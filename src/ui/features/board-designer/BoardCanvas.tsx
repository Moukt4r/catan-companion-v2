import { useMemo, useState, type KeyboardEvent } from "react";
import {
  NUMBER_TOKEN_PIPS,
  PORT_LABELS,
  TERRAIN_LABELS,
  coordinateKey,
  edgeKey,
  findHex,
  hexCenter,
  hexCornerPoints,
  isValidPortPlacement,
  neighbor,
  pixelBounds,
  portCenter,
  sortCoordinates,
  symmetricExpansionPairs,
  type BoardDesign,
  type HexCoordinate,
  type HexDirection,
} from "../../../domain";
import { Button } from "../../components";

const HEX_SIZE = 58;
const DIRECTIONS = [0, 1, 2, 3, 4, 5] as const;
const DIRECTION_LABELS: Record<HexDirection, string> = {
  0: "east",
  1: "north-east",
  2: "north-west",
  3: "west",
  4: "south-west",
  5: "south-east",
};
const PORT_SHORT_LABELS = {
  generic: "3:1",
  forest: "Wood 2:1",
  pasture: "Wool 2:1",
  fields: "Grain 2:1",
  hills: "Brick 2:1",
  mountains: "Ore 2:1",
} as const;

interface BoardCanvasProps {
  design: BoardDesign;
  selectedCoordinate: HexCoordinate | null;
  moveSource: HexCoordinate | null;
  issueCoordinates: ReadonlySet<string>;
  showBorderAdd: boolean;
  showPortEdges: boolean;
  onHexActivate: (coordinate: HexCoordinate) => void;
  onPortActivate: (
    landCoordinate: HexCoordinate,
    direction: HexDirection,
  ) => void;
  onBorderAdd: (coordinate: HexCoordinate) => void;
  onSelectCoordinate: (coordinate: HexCoordinate | null) => void;
}
export function BoardCanvas({
  design,
  issueCoordinates,
  moveSource,
  onBorderAdd,
  onHexActivate,
  onPortActivate,
  onSelectCoordinate,
  selectedCoordinate,
  showBorderAdd,
  showPortEdges,
}: BoardCanvasProps) {
  const [zoom, setZoom] = useState(1);
  /**
   * Whether land tiles are drawn blank, the way they sit on the table.
   *
   * The table deals every land tile face down and reveals the terrain during
   * play, so the number is public while the resource is not. This is purely
   * how the board is drawn: which tiles have actually been turned over lives
   * on the physical board, not in the app.
   */
  const [faceDown, setFaceDown] = useState(true);
  const occupiedKeys = useMemo(
    () => new Set(design.hexes.map((hex) => coordinateKey(hex.coordinate))),
    [design.hexes],
  );
  const emptyFootprint = useMemo(
    () =>
      sortCoordinates(
        design.footprint.filter(
          (coordinate) => !occupiedKeys.has(coordinateKey(coordinate)),
        ),
      ),
    [design.footprint, occupiedKeys],
  );
  const borderCandidates = useMemo(() => {
    if (!showBorderAdd) {
      return [];
    }
    const candidates = new Map<string, HexCoordinate>();
    for (const pair of symmetricExpansionPairs(design.footprint)) {
      candidates.set(coordinateKey(pair.first), pair.first);
      candidates.set(coordinateKey(pair.second), pair.second);
    }
    return sortCoordinates([...candidates.values()]);
  }, [design.footprint, showBorderAdd]);
  const displayCoordinates = [
    ...design.footprint,
    ...design.hexes.map((hex) => hex.coordinate),
    ...borderCandidates,
  ];
  const bounds = pixelBounds(displayCoordinates, HEX_SIZE, 48);
  const width = Math.max(640, bounds.width * zoom);
  const height = Math.max(520, bounds.height * zoom);
  const coordinateOptions = sortCoordinates(
    design.hexes.map((hex) => hex.coordinate),
  );
  const selectedKey = selectedCoordinate
    ? coordinateKey(selectedCoordinate)
    : "";

  return (
    <section
      className="surface board-canvas-card"
      aria-labelledby="board-canvas-heading"
    >
      <div className="board-canvas-toolbar">
        <div>
          <p className="card-kicker">Layout workspace</p>
          <h2 id="board-canvas-heading">Hex grid</h2>
        </div>
        <label className="board-cell-picker">
          <span>Select a placed hex</span>
          <select
            value={selectedKey}
            onChange={(event) => {
              const hex = design.hexes.find(
                (candidate) =>
                  coordinateKey(candidate.coordinate) === event.target.value,
              );
              onSelectCoordinate(hex?.coordinate ?? null);
            }}
          >
            <option value="">None selected</option>
            {coordinateOptions.map((coordinate) => {
              const hex = findHex(design.hexes, coordinate);
              return (
                <option
                  key={coordinateKey(coordinate)}
                  value={coordinateKey(coordinate)}
                >
                  {hex ? TERRAIN_LABELS[hex.terrain] : "Hex"} at q{" "}
                  {coordinate.q}, r {coordinate.r}
                </option>
              );
            })}
          </select>
        </label>
        <div className="board-zoom-controls" aria-label="Board zoom">
          <Button
            size="small"
            variant={faceDown ? "secondary" : "primary"}
            aria-pressed={!faceDown}
            onClick={() => {
              setFaceDown((current) => !current);
            }}
          >
            {faceDown ? "Reveal terrain" : "Hide terrain"}
          </Button>
          <Button
            size="small"
            variant="secondary"
            aria-label="Zoom board out"
            disabled={zoom <= 0.5}
            onClick={() => {
              setZoom((current) => Math.max(0.5, current - 0.25));
            }}
          >
            -
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button
            size="small"
            variant="secondary"
            aria-label="Zoom board in"
            disabled={zoom >= 2}
            onClick={() => {
              setZoom((current) => Math.min(2, current + 0.25));
            }}
          >
            +
          </Button>
        </div>
      </div>

      <div
        className="board-canvas-scroll"
        role="region"
        aria-label="Scrollable board canvas"
        tabIndex={0}
      >
        <svg
          className="board-canvas"
          width={width}
          height={height}
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
          role="group"
          aria-label={`${design.name} board layout with ${design.hexes.length} placed hexes`}
        >
          {borderCandidates.map((coordinate) => (
            <HexButton
              key={`border-add-${coordinateKey(coordinate)}`}
              coordinate={coordinate}
              className="board-hex board-hex--border-add"
              label={`Add mirrored border pair at q ${coordinate.q}, r ${coordinate.r}`}
              onActivate={() => {
                onBorderAdd(coordinate);
              }}
            >
              <text className="board-hex__add" textAnchor="middle" y="6">
                Add pair
              </text>
            </HexButton>
          ))}

          {emptyFootprint.map((coordinate) => (
            <HexButton
              key={`footprint-${coordinateKey(coordinate)}`}
              coordinate={coordinate}
              className="board-hex board-hex--footprint"
              label={`Empty border cell q ${coordinate.q}, r ${coordinate.r}`}
              onActivate={() => {
                onHexActivate(coordinate);
              }}
            >
              <text className="board-hex__add" textAnchor="middle" y="6">
                Empty
              </text>
            </HexButton>
          ))}

          {design.hexes.map((hex) => {
            const key = coordinateKey(hex.coordinate);
            const selected =
              selectedCoordinate !== null &&
              coordinateKey(selectedCoordinate) === key;
            const moving =
              moveSource !== null && coordinateKey(moveSource) === key;
            const warning = issueCoordinates.has(key);
            // Sea is part of the frame and stays visible; only land tiles are
            // dealt face down.
            const hidden = faceDown && hex.terrain !== "sea";
            return (
              <HexButton
                key={key}
                coordinate={hex.coordinate}
                terrain={hex.terrain}
                className={[
                  "board-hex",
                  hidden ? "board-hex--face-down" : `board-hex--${hex.terrain}`,
                  selected ? "board-hex--selected" : "",
                  moving ? "board-hex--moving" : "",
                  warning ? "board-hex--warning" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                label={`${
                  hidden ? "Face-down" : TERRAIN_LABELS[hex.terrain]
                } hex at q ${hex.coordinate.q}, r ${hex.coordinate.r}${
                  hex.numberToken === null
                    ? ", no number token"
                    : `, number ${hex.numberToken}`
                }`}
                onActivate={() => {
                  onHexActivate(hex.coordinate);
                }}
              >
                {hidden ? null : (
                  <text
                    className="board-hex__terrain-label"
                    textAnchor="middle"
                    y={hex.numberToken === null ? 5 : -13}
                  >
                    {TERRAIN_LABELS[hex.terrain]}
                  </text>
                )}
                {hex.numberToken !== null ? (
                  <g className="board-number-token">
                    <circle
                      className={
                        hex.numberToken === 6 || hex.numberToken === 8
                          ? "board-number-token__disc board-number-token__disc--red"
                          : "board-number-token__disc"
                      }
                      r="21"
                      cy="13"
                    />
                    <text
                      className="board-number-token__value"
                      textAnchor="middle"
                      y="12"
                    >
                      {hex.numberToken}
                    </text>
                    <text
                      className="board-number-token__pips"
                      textAnchor="middle"
                      y="27"
                    >
                      {NUMBER_TOKEN_PIPS[hex.numberToken]} pips
                    </text>
                  </g>
                ) : null}
              </HexButton>
            );
          })}

          {design.hexes.flatMap((hex) =>
            DIRECTIONS.flatMap((direction) => {
              const candidate = {
                landCoordinate: hex.coordinate,
                direction,
                type: "generic" as const,
              };
              if (!isValidPortPlacement(candidate, design.hexes)) {
                return [];
              }
              const existing = design.ports.find(
                (port) =>
                  edgeKey(port.landCoordinate, port.direction) ===
                  edgeKey(hex.coordinate, direction),
              );
              if (!showPortEdges && !existing) {
                return [];
              }
              const center = portCenter(hex.coordinate, direction, HEX_SIZE);
              const seaCoordinate = neighbor(hex.coordinate, direction);
              const label = existing
                ? PORT_LABELS[existing.type]
                : "Empty port edge";
              return [
                <g
                  key={`port-${edgeKey(hex.coordinate, direction)}`}
                  className={
                    existing
                      ? "board-port board-port--placed"
                      : "board-port board-port--available"
                  }
                  role="button"
                  tabIndex={0}
                  aria-label={`${label} between land q ${hex.coordinate.q}, r ${hex.coordinate.r} and sea q ${seaCoordinate.q}, r ${seaCoordinate.r}, ${DIRECTION_LABELS[direction]} edge`}
                  transform={`translate(${center.x} ${center.y})`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPortActivate(hex.coordinate, direction);
                  }}
                  onKeyDown={(event) => {
                    activateWithKeyboard(event, () => {
                      onPortActivate(hex.coordinate, direction);
                    });
                  }}
                >
                  <circle className="board-port__target" r="25" />
                  <rect
                    className="board-port__badge"
                    x="-30"
                    y="-13"
                    width="60"
                    height="26"
                    rx="10"
                  />
                  <text className="board-port__label" textAnchor="middle" y="4">
                    {existing ? PORT_SHORT_LABELS[existing.type] : "Port"}
                  </text>
                </g>,
              ];
            }),
          )}
        </svg>
      </div>
      <p className="board-canvas-help">
        Use the mirrored pair tools for small border edits, or the width and
        height controls to rebuild the complete border.
      </p>
    </section>
  );
}

interface HexButtonProps {
  coordinate: HexCoordinate;
  terrain?: BoardDesign["hexes"][number]["terrain"];
  className: string;
  label: string;
  onActivate: () => void;
  children: React.ReactNode;
}

function HexButton({
  children,
  className,
  coordinate,
  label,
  onActivate,
  terrain,
}: HexButtonProps) {
  const center = hexCenter(coordinate, HEX_SIZE);
  const points = hexCornerPoints(coordinate, HEX_SIZE)
    .map(({ x, y }) => `${x},${y}`)
    .join(" ");
  return (
    <g
      className={className}
      data-q={coordinate.q}
      data-r={coordinate.r}
      data-terrain={terrain}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onActivate}
      onKeyDown={(event) => {
        activateWithKeyboard(event, onActivate);
      }}
    >
      <polygon className="board-hex__shape" points={points} />
      <g transform={`translate(${center.x} ${center.y})`}>{children}</g>
    </g>
  );
}

function activateWithKeyboard(
  event: KeyboardEvent<SVGGElement>,
  activate: () => void,
): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    activate();
  }
}
