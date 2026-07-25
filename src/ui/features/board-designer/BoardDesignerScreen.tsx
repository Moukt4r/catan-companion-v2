import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_BOARD_HEXES,
  NUMBER_TOKEN_VALUES,
  PORT_LABELS,
  PORT_TYPES,
  TERRAIN_LABELS,
  TERRAIN_TYPES,
  coordinateKey,
  findHex,
  footprintDimensions,
  isProducingTerrain,
  neighbor,
  remainingInventory,
  totalTerrain,
  validateBoardDesign,
  type BoardCommand,
  type BoardDesign,
  type HexCoordinate,
  type HexDirection,
  type NumberTokenValue,
  type PortType,
  type TerrainType,
} from "../../../domain";
import {
  Button,
  ConfirmDialog,
  LiveRegion,
  NumberStepper,
  StatusBanner,
} from "../../components";
import { BoardCanvas } from "./BoardCanvas";
import type { BoardEditorTool } from "./editorTypes";

const DIRECTIONS = [0, 1, 2, 3, 4, 5] as const;
const DIRECTION_LABELS: Record<HexDirection, string> = {
  0: "East",
  1: "North-east",
  2: "North-west",
  3: "West",
  4: "South-west",
  5: "South-east",
};

interface BoardDesignerScreenProps {
  design: BoardDesign;
  saving: boolean;
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
  onCommand: (command: BoardCommand) => Promise<void>;
  onResizeFootprint: (width: number, height: number) => Promise<void>;
  onGenerate: () => Promise<void>;
  onUndo: () => Promise<void>;
  onRedo: () => Promise<void>;
  onExport: (format: "json" | "svg" | "png" | "print") => void;
}

export function BoardDesignerScreen({
  canRedo,
  canUndo,
  design,
  error,
  onBack,
  onCommand,
  onExport,
  onGenerate,
  onResizeFootprint,
  onRedo,
  onUndo,
  saving,
}: BoardDesignerScreenProps) {
  const [tool, setTool] = useState<BoardEditorTool>({
    kind: "terrain",
    terrain: "forest",
  });
  const [selectedCoordinate, setSelectedCoordinate] =
    useState<HexCoordinate | null>(null);
  const [moveSource, setMoveSource] = useState<HexCoordinate | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [nameDraft, setNameDraft] = useState<NameDraftState>({
    observedName: design.name,
    value: design.name,
    editVersion: 0,
    submittedVersion: null,
  });
  const initialDimensions = footprintDimensions(design.footprint);
  const [dimensionDraft, setDimensionDraft] = useState({
    observedWidth: Math.max(1, initialDimensions.width),
    observedHeight: Math.max(1, initialDimensions.height),
    width: Math.max(1, initialDimensions.width),
    height: Math.max(1, initialDimensions.height),
  });
  const [generateConfirmation, setGenerateConfirmation] = useState(false);
  const [footprintConfirmation, setFootprintConfirmation] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState(false);
  const remaining = useMemo(() => remainingInventory(design), [design]);
  const issues = useMemo(() => validateBoardDesign(design), [design]);
  const issueCoordinates = useMemo(
    () =>
      new Set(
        issues.flatMap(({ coordinates }) =>
          coordinates.map((coordinate) => coordinateKey(coordinate)),
        ),
      ),
    [issues],
  );
  const activeSelectedCoordinate =
    selectedCoordinate && findHex(design.hexes, selectedCoordinate)
      ? selectedCoordinate
      : null;
  const activeMoveSource =
    moveSource && findHex(design.hexes, moveSource) ? moveSource : null;
  const selectedHex = activeSelectedCoordinate
    ? findHex(design.hexes, activeSelectedCoordinate)
    : undefined;
  const name = resolvedDraftName(nameDraft, design.name);
  const nameDirty = name.trim() !== design.name;
  const warningCount = issues.filter(
    ({ severity }) => severity === "warning",
  ).length;
  const errorCount = issues.filter(
    ({ severity }) => severity === "error",
  ).length;
  const terrainTileCount = totalTerrain(design.inventory);
  const footprintMatchesInventory =
    design.footprint.length === terrainTileCount;
  const currentDimensions = footprintDimensions(design.footprint);
  const currentDisplayDimensions = {
    width: Math.max(1, currentDimensions.width),
    height: Math.max(1, currentDimensions.height),
  };
  const dimensionDraftDirty =
    dimensionDraft.width !== dimensionDraft.observedWidth ||
    dimensionDraft.height !== dimensionDraft.observedHeight;
  const dimensionsChangedExternally =
    dimensionDraft.observedWidth !== currentDisplayDimensions.width ||
    dimensionDraft.observedHeight !== currentDisplayDimensions.height;
  const resolvedDimensions =
    dimensionsChangedExternally && !dimensionDraftDirty
      ? currentDisplayDimensions
      : dimensionDraft;
  const dimensionsChanged =
    resolvedDimensions.width !== currentDimensions.width ||
    resolvedDimensions.height !== currentDimensions.height;
  const dimensionCapacity =
    resolvedDimensions.width * resolvedDimensions.height;
  const dimensionIssue =
    !Number.isSafeInteger(resolvedDimensions.width) ||
    !Number.isSafeInteger(resolvedDimensions.height) ||
    resolvedDimensions.width < 1 ||
    resolvedDimensions.height < 1
      ? "Width and height must be positive whole numbers."
      : dimensionCapacity > MAX_BOARD_HEXES
        ? `Width × height may contain at most ${MAX_BOARD_HEXES} cells.`
        : dimensionCapacity < terrainTileCount
          ? `${resolvedDimensions.width} × ${resolvedDimensions.height} holds only ${dimensionCapacity} cells.`
          : (dimensionCapacity - terrainTileCount) % 2 !== 0
            ? "Width × height must have the same odd or even parity as the tile count."
            : null;

  function applyDimensions(): void {
    const width = resolvedDimensions.width;
    const height = resolvedDimensions.height;
    void onResizeFootprint(width, height).then(() => {
      setDimensionDraft({
        observedWidth: width,
        observedHeight: height,
        width,
        height,
      });
    });
  }

  const commit = useCallback(
    async (command: BoardCommand, successMessage: string): Promise<boolean> => {
      try {
        await onCommand(command);
        setAnnouncement(successMessage);
        return true;
      } catch (commitError) {
        setAnnouncement(errorMessage(commitError));
        return false;
      }
    },
    [onCommand],
  );

  useEffect(() => {
    const nextName = name.trim();
    if (!nameDirty || nextName.length === 0) {
      return;
    }
    const submittedVersion = nameDraft.editVersion;
    const timeout = window.setTimeout(() => {
      setNameDraft((current) => ({
        ...current,
        observedName: design.name,
        value: resolvedDraftName(current, design.name),
        submittedVersion,
      }));
      void onCommand({ type: "design.renamed", name: nextName })
        .then(() => {
          setAnnouncement("Design renamed.");
        })
        .catch((renameError: unknown) => {
          setAnnouncement(errorMessage(renameError));
          setNameDraft((current) =>
            current.editVersion > submittedVersion
              ? current
              : {
                  observedName: design.name,
                  value: design.name,
                  editVersion: current.editVersion,
                  submittedVersion: null,
                },
          );
        });
    }, 500);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [design.name, name, nameDirty, nameDraft.editVersion, onCommand]);

  function activateHex(coordinate: HexCoordinate): void {
    const hex = findHex(design.hexes, coordinate);
    setSelectedCoordinate(hex ? coordinate : activeSelectedCoordinate);

    if (tool.kind === "border-remove") {
      void commit(
        { type: "footprint.pairRemoved", coordinate },
        `Mirrored border pair removed at q ${coordinate.q}, r ${coordinate.r}.`,
      );
      setSelectedCoordinate(null);
      setMoveSource(null);
      return;
    }

    if (tool.kind === "terrain") {
      void commit(
        hex
          ? {
              type: "hex.terrainChanged",
              coordinate,
              terrain: tool.terrain,
            }
          : { type: "hex.placed", coordinate, terrain: tool.terrain },
        `${TERRAIN_LABELS[tool.terrain]} placed at q ${coordinate.q}, r ${coordinate.r}.`,
      );
      return;
    }

    if (tool.kind === "number" && hex) {
      void commit(
        { type: "numberToken.set", coordinate, value: tool.value },
        `Number ${tool.value} placed.`,
      );
      return;
    }

    if (tool.kind === "erase" && hex) {
      void commit(
        { type: "hex.removed", coordinate },
        `Hex at q ${coordinate.q}, r ${coordinate.r} removed.`,
      );
      setSelectedCoordinate(null);
      setMoveSource(null);
      return;
    }

    if (tool.kind === "move") {
      if (hex) {
        setMoveSource(coordinate);
        setSelectedCoordinate(coordinate);
        setAnnouncement(
          `Move source selected at q ${coordinate.q}, r ${coordinate.r}.`,
        );
      } else if (activeMoveSource) {
        void commit(
          {
            type: "hex.moved",
            from: activeMoveSource,
            to: coordinate,
          },
          `Hex moved to q ${coordinate.q}, r ${coordinate.r}.`,
        );
        setMoveSource(null);
        setSelectedCoordinate(coordinate);
      }
      return;
    }

    if (hex) {
      setSelectedCoordinate(coordinate);
    }
  }

  function activateBorderAdd(coordinate: HexCoordinate): void {
    void commit(
      { type: "footprint.pairAdded", coordinate },
      `Mirrored border pair added at q ${coordinate.q}, r ${coordinate.r}.`,
    );
  }

  function activatePort(
    landCoordinate: HexCoordinate,
    direction: HexDirection,
  ): void {
    if (tool.kind === "port") {
      void commit(
        {
          type: "port.set",
          landCoordinate,
          direction,
          portType: tool.portType,
        },
        `${PORT_LABELS[tool.portType]} placed.`,
      );
    } else if (tool.kind === "erase") {
      void commit(
        {
          type: "port.set",
          landCoordinate,
          direction,
          portType: null,
        },
        "Port removed.",
      );
    }
    setSelectedCoordinate(landCoordinate);
  }

  return (
    <main
      className="board-designer-layout"
      data-design-revision={design.revision}
    >
      <LiveRegion message={announcement} />
      <header className="board-designer-header">
        <div className="board-designer-header__identity">
          <Button
            variant="quiet"
            disabled={saving || nameDirty}
            onClick={onBack}
          >
            Saved designs
          </Button>
          <label className="board-name-field">
            <span>Design name</span>
            <input
              value={name}
              maxLength={80}
              onChange={(event) => {
                const value = event.target.value;
                setNameDraft((current) => ({
                  observedName: design.name,
                  value,
                  editVersion: current.editVersion + 1,
                  submittedVersion: current.submittedVersion,
                }));
              }}
              onBlur={() => {
                if (name.trim().length === 0) {
                  setNameDraft((current) => ({
                    observedName: design.name,
                    value: design.name,
                    editVersion: current.editVersion + 1,
                    submittedVersion: null,
                  }));
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  setNameDraft((current) => ({
                    observedName: design.name,
                    value: design.name,
                    editVersion: current.editVersion + 1,
                    submittedVersion: null,
                  }));
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          <span
            className={`save-pill ${
              saving || nameDirty ? "save-pill--info" : "save-pill--success"
            }`}
            role="status"
          >
            {nameDirty
              ? "Unsaved changes"
              : saving
                ? "Saving"
                : "Saved locally"}
          </span>
        </div>
        <div className="board-designer-header__actions">
          <Button
            size="small"
            variant="secondary"
            disabled={!canUndo || saving}
            onClick={() => {
              setNameDraft((current) => ({
                observedName: design.name,
                value: design.name,
                editVersion: current.editVersion + 1,
                submittedVersion: null,
              }));
              setDimensionDraft({
                observedWidth: currentDisplayDimensions.width,
                observedHeight: currentDisplayDimensions.height,
                width: currentDisplayDimensions.width,
                height: currentDisplayDimensions.height,
              });
              void onUndo();
            }}
          >
            Undo
          </Button>
          <Button
            size="small"
            variant="secondary"
            disabled={!canRedo || saving}
            onClick={() => {
              setNameDraft((current) => ({
                observedName: design.name,
                value: design.name,
                editVersion: current.editVersion + 1,
                submittedVersion: null,
              }));
              setDimensionDraft({
                observedWidth: currentDisplayDimensions.width,
                observedHeight: currentDisplayDimensions.height,
                width: currentDisplayDimensions.width,
                height: currentDisplayDimensions.height,
              });
              void onRedo();
            }}
          >
            Redo
          </Button>
          <Button
            size="small"
            disabled={
              terrainTileCount === 0 || !footprintMatchesInventory || saving
            }
            onClick={() => {
              if (design.hexes.length > 0) {
                setGenerateConfirmation(true);
              } else {
                void onGenerate();
              }
            }}
          >
            Generate board
          </Button>
          <Button
            size="small"
            variant="quiet"
            disabled={design.hexes.length === 0 || saving}
            onClick={() => {
              setClearConfirmation(true);
            }}
          >
            Clear layout
          </Button>
        </div>
      </header>

      {error ? (
        <StatusBanner tone="danger" role="alert">
          {error}
        </StatusBanner>
      ) : null}

      <aside
        className="surface board-inventory-panel"
        aria-label="Board inventory"
      >
        <p className="card-kicker">Piece inventory</p>
        <h2>Choose and place</h2>
        <p className="fine-print">
          Counts are totals. Badges show how many pieces remain unplaced.
        </p>

        <section className="board-footprint-controls">
          <div>
            <strong>Symmetric border</strong>
            <span>
              {design.footprint.length} cells / {terrainTileCount} terrain tiles
            </span>
          </div>
          {!footprintMatchesInventory ? (
            <StatusBanner tone="warning">
              Apply compatible dimensions or add/remove mirrored pairs until the
              border matches the terrain inventory.
            </StatusBanner>
          ) : null}
          <div
            className="board-dimension-controls"
            aria-label="Border dimensions"
          >
            <label>
              <span>Width</span>
              <input
                type="number"
                min={1}
                max={MAX_BOARD_HEXES}
                step={1}
                value={resolvedDimensions.width}
                onChange={(event) => {
                  setDimensionDraft({
                    observedWidth: currentDisplayDimensions.width,
                    observedHeight: currentDisplayDimensions.height,
                    width: Number(event.target.value),
                    height: resolvedDimensions.height,
                  });
                }}
              />
            </label>
            <span aria-hidden="true">×</span>
            <label>
              <span>Height</span>
              <input
                type="number"
                min={1}
                max={MAX_BOARD_HEXES}
                step={1}
                value={resolvedDimensions.height}
                onChange={(event) => {
                  setDimensionDraft({
                    observedWidth: currentDisplayDimensions.width,
                    observedHeight: currentDisplayDimensions.height,
                    width: resolvedDimensions.width,
                    height: Number(event.target.value),
                  });
                }}
              />
            </label>
          </div>
          <p className="fine-print">
            Axial columns × rows. The border keeps exactly {terrainTileCount}{" "}
            cells.
          </p>
          {dimensionIssue ? (
            <StatusBanner tone="warning">{dimensionIssue}</StatusBanner>
          ) : null}
          <Button
            variant="secondary"
            disabled={
              terrainTileCount === 0 ||
              saving ||
              !dimensionsChanged ||
              dimensionIssue !== null
            }
            onClick={() => {
              if (design.hexes.length > 0) {
                setFootprintConfirmation(true);
              } else {
                applyDimensions();
              }
            }}
          >
            Apply width × height
          </Button>
          <div className="board-border-tools" aria-label="Border editing tools">
            {(["border-add", "border-remove"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                className="board-tool"
                aria-pressed={tool.kind === kind}
                onClick={() => {
                  setTool({ kind });
                  setMoveSource(null);
                }}
              >
                {kind === "border-add"
                  ? "Add mirrored pair"
                  : "Remove mirrored pair"}
              </button>
            ))}
          </div>
        </section>

        <div className="board-basic-tools" aria-label="Board editing tools">
          {(["select", "move", "erase"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="board-tool"
              aria-pressed={tool.kind === kind}
              onClick={() => {
                setTool({ kind });
                if (kind !== "move") {
                  setMoveSource(null);
                }
              }}
            >
              {kind[0]?.toUpperCase()}
              {kind.slice(1)}
            </button>
          ))}
        </div>

        <InventorySection title="Terrain hexes" open>
          <div className="board-palette" aria-label="Terrain placement tools">
            {TERRAIN_TYPES.map((terrain) => (
              <PaletteButton
                key={terrain}
                active={tool.kind === "terrain" && tool.terrain === terrain}
                disabled={remaining.terrain[terrain] <= 0}
                className={`board-palette-item board-palette-item--${terrain}`}
                label={TERRAIN_LABELS[terrain]}
                remaining={remaining.terrain[terrain]}
                onClick={() => {
                  setTool({ kind: "terrain", terrain });
                  setMoveSource(null);
                }}
              />
            ))}
          </div>
          <div className="board-inventory-steppers">
            {TERRAIN_TYPES.map((terrain) => (
              <InventoryNumberStepper
                key={terrain}
                label={TERRAIN_LABELS[terrain]}
                value={design.inventory.terrain[terrain]}
                onCommit={(count) =>
                  commit(
                    {
                      type: "inventory.countSet",
                      category: "terrain",
                      item: terrain,
                      count,
                    },
                    `${TERRAIN_LABELS[terrain]} inventory updated.`,
                  )
                }
              />
            ))}
          </div>
        </InventorySection>

        <InventorySection title="Number tokens">
          <div className="board-palette board-palette--numbers">
            {NUMBER_TOKEN_VALUES.map((value) => (
              <PaletteButton
                key={value}
                active={tool.kind === "number" && tool.value === value}
                disabled={remaining.numbers[value] <= 0}
                className={
                  value === 6 || value === 8
                    ? "board-palette-item board-palette-number board-palette-number--red"
                    : "board-palette-item board-palette-number"
                }
                label={String(value)}
                remaining={remaining.numbers[value]}
                onClick={() => {
                  setTool({ kind: "number", value });
                  setMoveSource(null);
                }}
              />
            ))}
          </div>
          <div className="board-inventory-steppers">
            {NUMBER_TOKEN_VALUES.map((value) => (
              <InventoryNumberStepper
                key={value}
                label={`Number ${value}`}
                value={design.inventory.numbers[value]}
                onCommit={(count) =>
                  commit(
                    {
                      type: "inventory.countSet",
                      category: "number",
                      item: value,
                      count,
                    },
                    `Number ${value} inventory updated.`,
                  )
                }
              />
            ))}
          </div>
        </InventorySection>

        <InventorySection title="Ports">
          <div className="board-palette board-palette--ports">
            {PORT_TYPES.map((portType) => (
              <PaletteButton
                key={portType}
                active={tool.kind === "port" && tool.portType === portType}
                disabled={remaining.ports[portType] <= 0}
                className="board-palette-item board-palette-port"
                label={PORT_LABELS[portType]}
                remaining={remaining.ports[portType]}
                onClick={() => {
                  setTool({ kind: "port", portType });
                  setMoveSource(null);
                }}
              />
            ))}
          </div>
          <div className="board-inventory-steppers">
            {PORT_TYPES.map((portType) => (
              <InventoryNumberStepper
                key={portType}
                label={PORT_LABELS[portType]}
                value={design.inventory.ports[portType]}
                onCommit={(count) =>
                  commit(
                    {
                      type: "inventory.countSet",
                      category: "port",
                      item: portType,
                      count,
                    },
                    `${PORT_LABELS[portType]} inventory updated.`,
                  )
                }
              />
            ))}
          </div>
        </InventorySection>
      </aside>

      <BoardCanvas
        design={design}
        selectedCoordinate={activeSelectedCoordinate}
        moveSource={activeMoveSource}
        issueCoordinates={issueCoordinates}
        showBorderAdd={tool.kind === "border-add"}
        showPortEdges={tool.kind === "port" || tool.kind === "erase"}
        onHexActivate={activateHex}
        onBorderAdd={activateBorderAdd}
        onPortActivate={activatePort}
        onSelectCoordinate={setSelectedCoordinate}
      />

      <aside
        className="board-inspector-column"
        aria-label="Board details and exports"
      >
        <section className="surface board-inspector">
          <p className="card-kicker">Selection</p>
          <h2>Hex inspector</h2>
          {selectedHex ? (
            <div className="form-stack">
              <p>
                Coordinate q {selectedHex.coordinate.q}, r{" "}
                {selectedHex.coordinate.r}
              </p>
              <label className="field">
                <span>Terrain</span>
                <select
                  value={selectedHex.terrain}
                  onChange={(event) => {
                    void commit(
                      {
                        type: "hex.terrainChanged",
                        coordinate: selectedHex.coordinate,
                        terrain: event.target.value as TerrainType,
                      },
                      "Terrain changed.",
                    );
                  }}
                >
                  {TERRAIN_TYPES.map((terrain) => (
                    <option
                      key={terrain}
                      value={terrain}
                      disabled={
                        terrain !== selectedHex.terrain &&
                        remaining.terrain[terrain] <= 0
                      }
                    >
                      {TERRAIN_LABELS[terrain]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Number token</span>
                <select
                  value={selectedHex.numberToken ?? ""}
                  disabled={!isProducingTerrain(selectedHex.terrain)}
                  onChange={(event) => {
                    const value =
                      event.target.value === ""
                        ? null
                        : (Number(event.target.value) as NumberTokenValue);
                    void commit(
                      {
                        type: "numberToken.set",
                        coordinate: selectedHex.coordinate,
                        value,
                      },
                      value === null
                        ? "Number token removed."
                        : `Number ${value} placed.`,
                    );
                  }}
                >
                  <option value="">No token</option>
                  {NUMBER_TOKEN_VALUES.map((value) => (
                    <option
                      key={value}
                      value={value}
                      disabled={
                        value !== selectedHex.numberToken &&
                        remaining.numbers[value] <= 0
                      }
                    >
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="board-direction-controls">
                <legend>Move one grid space</legend>
                {DIRECTIONS.map((direction) => {
                  const target = neighbor(selectedHex.coordinate, direction);
                  return (
                    <Button
                      key={direction}
                      size="small"
                      variant="secondary"
                      disabled={Boolean(findHex(design.hexes, target))}
                      onClick={() => {
                        void commit(
                          {
                            type: "hex.moved",
                            from: selectedHex.coordinate,
                            to: target,
                          },
                          `Hex moved ${DIRECTION_LABELS[direction].toLowerCase()}.`,
                        );
                        setSelectedCoordinate(target);
                      }}
                    >
                      {DIRECTION_LABELS[direction]}
                    </Button>
                  );
                })}
              </fieldset>

              {selectedHex.terrain !== "sea" ? (
                <fieldset className="board-coast-controls">
                  <legend>Coastline ports</legend>
                  {DIRECTIONS.map((direction) => {
                    const sea = findHex(
                      design.hexes,
                      neighbor(selectedHex.coordinate, direction),
                    );
                    if (sea?.terrain !== "sea") {
                      return null;
                    }
                    const current = design.ports.find(
                      (port) =>
                        coordinateKey(port.landCoordinate) ===
                          coordinateKey(selectedHex.coordinate) &&
                        port.direction === direction,
                    );
                    return (
                      <label className="field" key={direction}>
                        <span>{DIRECTION_LABELS[direction]} edge</span>
                        <select
                          value={current?.type ?? ""}
                          onChange={(event) => {
                            const portType =
                              event.target.value === ""
                                ? null
                                : (event.target.value as PortType);
                            void commit(
                              {
                                type: "port.set",
                                landCoordinate: selectedHex.coordinate,
                                direction,
                                portType,
                              },
                              portType === null
                                ? "Port removed."
                                : `${PORT_LABELS[portType]} placed.`,
                            );
                          }}
                        >
                          <option value="">No port</option>
                          {PORT_TYPES.map((portType) => (
                            <option
                              key={portType}
                              value={portType}
                              disabled={
                                portType !== current?.type &&
                                remaining.ports[portType] <= 0
                              }
                            >
                              {PORT_LABELS[portType]}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}

              <Button
                variant="danger"
                onClick={() => {
                  void commit(
                    {
                      type: "hex.removed",
                      coordinate: selectedHex.coordinate,
                    },
                    "Hex removed.",
                  );
                  setSelectedCoordinate(null);
                }}
              >
                Remove selected hex
              </Button>
            </div>
          ) : (
            <p>
              Select a placed hex to edit its terrain, token, position, or
              ports.
            </p>
          )}
        </section>

        <section
          className="surface board-checks"
          aria-labelledby="board-checks-heading"
        >
          <p className="card-kicker">Rules-aware review</p>
          <h2 id="board-checks-heading">Board checks</h2>
          <StatusBanner
            tone={
              errorCount > 0
                ? "danger"
                : warningCount > 0
                  ? "warning"
                  : "success"
            }
          >
            {errorCount > 0
              ? `${errorCount} structural ${
                  errorCount === 1 ? "issue" : "issues"
                }`
              : warningCount > 0
                ? `${warningCount} balance ${
                    warningCount === 1 ? "warning" : "warnings"
                  }`
                : "No structural or balance warnings"}
          </StatusBanner>
          <ul className="board-check-list">
            {issues.map((issue, index) => (
              <li
                key={`${issue.code}-${index}`}
                className={`board-check board-check--${issue.severity}`}
              >
                <span>{issue.message}</span>
                {issue.coordinates[0] ? (
                  <Button
                    size="small"
                    variant="quiet"
                    onClick={() => {
                      setSelectedCoordinate(issue.coordinates[0] ?? null);
                    }}
                  >
                    Show
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="surface board-export-panel">
          <p className="card-kicker">Take it to the table</p>
          <h2>Export</h2>
          <div className="board-export-actions">
            <Button
              variant="secondary"
              onClick={() => {
                onExport("json");
              }}
            >
              JSON
            </Button>
            <Button
              variant="secondary"
              disabled={design.hexes.length === 0}
              onClick={() => {
                onExport("svg");
              }}
            >
              SVG
            </Button>
            <Button
              variant="secondary"
              disabled={design.hexes.length === 0}
              onClick={() => {
                onExport("png");
              }}
            >
              PNG
            </Button>
            <Button
              variant="secondary"
              disabled={design.hexes.length === 0}
              onClick={() => {
                onExport("print");
              }}
            >
              Print
            </Button>
          </div>
        </section>
      </aside>

      <ConfirmDialog
        open={footprintConfirmation}
        title="Apply the new border dimensions?"
        description={`The border will be rebuilt as ${resolvedDimensions.width} × ${resolvedDimensions.height} while keeping ${terrainTileCount} cells. Any placed tiles outside the new border return to inventory, and Undo restores the current shape.`}
        confirmLabel="Apply dimensions"
        onCancel={() => {
          setFootprintConfirmation(false);
        }}
        onConfirm={() => {
          setFootprintConfirmation(false);
          setSelectedCoordinate(null);
          setMoveSource(null);
          applyDimensions();
        }}
      />

      <ConfirmDialog
        open={generateConfirmation}
        title="Generate a new layout?"
        description="This replaces every placed hex, number token, and port using the current inventory. Undo restores the current layout."
        confirmLabel="Generate layout"
        onCancel={() => {
          setGenerateConfirmation(false);
        }}
        onConfirm={() => {
          setGenerateConfirmation(false);
          setSelectedCoordinate(null);
          setMoveSource(null);
          void onGenerate();
        }}
      />

      <ConfirmDialog
        open={clearConfirmation}
        title="Clear the layout?"
        description="Every placed item returns to the inventory. The selected counts remain unchanged and Undo restores the board."
        confirmLabel="Clear layout"
        danger
        onCancel={() => {
          setClearConfirmation(false);
        }}
        onConfirm={() => {
          setClearConfirmation(false);
          setSelectedCoordinate(null);
          setMoveSource(null);
          void commit(
            {
              type: "layout.replaced",
              layout: { hexes: [], ports: [] },
            },
            "Layout cleared.",
          );
        }}
      />
    </main>
  );
}

interface InventorySectionProps {
  title: string;
  open?: boolean;
  children: React.ReactNode;
}

interface NameDraftState {
  observedName: string;
  value: string;
  editVersion: number;
  submittedVersion: number | null;
}

function resolvedDraftName(
  draft: NameDraftState,
  persistedName: string,
): string {
  if (draft.observedName === persistedName) {
    return draft.value;
  }
  const hasLocalEdit = draft.value.trim() !== draft.observedName;
  const hasNewerEdit =
    draft.submittedVersion === null ||
    draft.editVersion > draft.submittedVersion;
  return hasLocalEdit && hasNewerEdit ? draft.value : persistedName;
}

function InventorySection({
  children,
  open = false,
  title,
}: InventorySectionProps) {
  return (
    <details className="board-inventory-section" open={open}>
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}

interface PaletteButtonProps {
  active: boolean;
  disabled: boolean;
  className: string;
  label: string;
  remaining: number;
  onClick: () => void;
}

function PaletteButton({
  active,
  className,
  disabled,
  label,
  onClick,
  remaining,
}: PaletteButtonProps) {
  return (
    <button
      type="button"
      className={className}
      aria-label={`${label}, ${remaining} left`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <strong>{label}</strong>
      <span>{remaining} left</span>
    </button>
  );
}

interface InventoryNumberStepperProps {
  label: string;
  value: number;
  onCommit: (value: number) => Promise<boolean>;
}

function InventoryNumberStepper({
  label,
  onCommit,
  value,
}: InventoryNumberStepperProps) {
  const requestId = useRef(0);
  const [draft, setDraft] = useState({
    sourceValue: value,
    value,
    pending: false,
  });
  const displayedValue =
    draft.pending || draft.sourceValue === value ? draft.value : value;
  const displayedValueRef = useRef(value);

  useEffect(() => {
    if (!draft.pending) {
      displayedValueRef.current = displayedValue;
    }
  }, [displayedValue, draft.pending]);

  return (
    <NumberStepper
      compact
      label={label}
      value={displayedValue}
      min={0}
      max={MAX_BOARD_HEXES}
      onChange={(nextValue) => {
        const delta = nextValue - displayedValue;
        const requestedValue = Math.min(
          MAX_BOARD_HEXES,
          Math.max(0, displayedValueRef.current + delta),
        );
        displayedValueRef.current = requestedValue;
        requestId.current += 1;
        const currentRequest = requestId.current;
        setDraft((current) => ({
          ...current,
          value: requestedValue,
          pending: true,
        }));
        void onCommit(requestedValue).then((saved) => {
          if (currentRequest !== requestId.current) {
            return;
          }
          const settledValue = saved ? requestedValue : value;
          displayedValueRef.current = settledValue;
          setDraft({
            sourceValue: settledValue,
            value: settledValue,
            pending: false,
          });
        });
      }}
    />
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The board design could not be changed.";
}
