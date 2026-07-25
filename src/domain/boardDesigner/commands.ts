import {
  coordinateKey,
  edgeKey,
  findHex,
  isConnected,
  isValidPortPlacement,
  sameCoordinate,
} from "./coordinates";
import {
  appendPair,
  findSymmetricPair,
  isSymmetricFootprint,
  removePair,
  symmetricExpansionPairs,
  symmetricRemovalPairs,
} from "./footprint";
import {
  inventoryFitsDesign,
  isProducingTerrain,
  placedInventory,
  remainingInventory,
  setNumberCount,
  setPortCount,
  setTerrainCount,
  totalTerrain,
} from "./inventory";
import {
  MAX_BOARD_HEXES,
  type BoardCommand,
  type BoardDesign,
  type BoardHex,
  type BoardMutationErrorCode,
  type BoardMutationResult,
  type BoardPort,
  type HexCoordinate,
} from "./types";

function success(value: BoardDesign): BoardMutationResult<BoardDesign> {
  return { ok: true, value };
}

function failure(
  code: BoardMutationErrorCode,
  message: string,
): BoardMutationResult<BoardDesign> {
  return { ok: false, error: { code, message } };
}

function validCoordinate(coordinate: HexCoordinate): boolean {
  return (
    Number.isSafeInteger(coordinate.q) &&
    Number.isSafeInteger(coordinate.r) &&
    Math.abs(coordinate.q) <= MAX_BOARD_HEXES &&
    Math.abs(coordinate.r) <= MAX_BOARD_HEXES
  );
}

function removeInvalidPorts(
  ports: readonly BoardPort[],
  hexes: readonly BoardHex[],
): BoardPort[] {
  return ports.filter((port) => isValidPortPlacement(port, hexes));
}

function validFootprint(coordinates: readonly HexCoordinate[]): boolean {
  return (
    coordinates.length <= MAX_BOARD_HEXES &&
    coordinates.every(validCoordinate) &&
    new Set(coordinates.map(coordinateKey)).size === coordinates.length &&
    isSymmetricFootprint(coordinates) &&
    (coordinates.length === 0 ||
      isConnected(
        coordinates.map((coordinate) => ({
          coordinate,
          terrain: "sea",
          numberToken: null,
        })),
      ))
  );
}

export function applyBoardCommand(
  design: BoardDesign,
  command: BoardCommand,
): BoardMutationResult<BoardDesign> {
  switch (command.type) {
    case "design.renamed": {
      const name = command.name.trim();
      if (name.length === 0 || name.length > 80) {
        return failure(
          "invalid-name",
          "Board names must contain between 1 and 80 characters.",
        );
      }
      return success({ ...design, name });
    }

    case "inventory.countSet": {
      if (
        !Number.isSafeInteger(command.count) ||
        command.count < 0 ||
        command.count > MAX_BOARD_HEXES
      ) {
        return failure(
          "invalid-count",
          `Inventory counts must be between 0 and ${MAX_BOARD_HEXES}.`,
        );
      }
      const placed = placedInventory(design);
      if (
        (command.category === "terrain" &&
          command.count < placed.terrain[command.item]) ||
        (command.category === "number" &&
          command.count < placed.numbers[command.item]) ||
        (command.category === "port" &&
          command.count < placed.ports[command.item])
      ) {
        return failure(
          "invalid-count",
          "Remove placed items before reducing the inventory below that amount.",
        );
      }

      const inventory =
        command.category === "terrain"
          ? setTerrainCount(design.inventory, command.item, command.count)
          : command.category === "number"
            ? setNumberCount(design.inventory, command.item, command.count)
            : setPortCount(design.inventory, command.item, command.count);

      if (totalTerrain(inventory) > MAX_BOARD_HEXES) {
        return failure(
          "invalid-count",
          `A design can contain at most ${MAX_BOARD_HEXES} hexes.`,
        );
      }
      return success({ ...design, inventory });
    }

    case "hex.placed": {
      if (!validCoordinate(command.coordinate)) {
        return failure("invalid-layout", "The hex coordinate is invalid.");
      }
      if (findHex(design.hexes, command.coordinate)) {
        return failure("position-occupied", "That grid position is occupied.");
      }
      if (design.footprint.length === 0) {
        return failure(
          "invalid-footprint",
          "Create the board border before placing terrain.",
        );
      }
      if (
        !design.footprint.some((coordinate) =>
          sameCoordinate(coordinate, command.coordinate),
        )
      ) {
        return failure(
          "invalid-footprint",
          "Place tiles inside the current board border.",
        );
      }
      if (remainingInventory(design).terrain[command.terrain] <= 0) {
        return failure(
          "inventory-exhausted",
          "No matching terrain hex remains in the inventory.",
        );
      }
      return success({
        ...design,
        hexes: [
          ...design.hexes,
          {
            coordinate: { ...command.coordinate },
            terrain: command.terrain,
            numberToken: null,
          },
        ],
      });
    }

    case "hex.terrainChanged": {
      const target = findHex(design.hexes, command.coordinate);
      if (!target) {
        return failure("position-empty", "That grid position is empty.");
      }
      if (target.terrain === command.terrain) {
        return success(design);
      }
      if (remainingInventory(design).terrain[command.terrain] <= 0) {
        return failure(
          "inventory-exhausted",
          "No matching terrain hex remains in the inventory.",
        );
      }

      const hexes = design.hexes.map((hex) =>
        sameCoordinate(hex.coordinate, command.coordinate)
          ? {
              ...hex,
              terrain: command.terrain,
              numberToken: isProducingTerrain(command.terrain)
                ? hex.numberToken
                : null,
            }
          : hex,
      );
      return success({
        ...design,
        hexes,
        ports: removeInvalidPorts(design.ports, hexes),
      });
    }

    case "hex.removed": {
      if (!findHex(design.hexes, command.coordinate)) {
        return failure("position-empty", "That grid position is empty.");
      }
      const hexes = design.hexes.filter(
        (hex) => !sameCoordinate(hex.coordinate, command.coordinate),
      );
      return success({
        ...design,
        hexes,
        ports: removeInvalidPorts(design.ports, hexes),
      });
    }

    case "hex.moved": {
      if (!validCoordinate(command.to)) {
        return failure("invalid-layout", "The target coordinate is invalid.");
      }
      const source = findHex(design.hexes, command.from);
      if (!source) {
        return failure("position-empty", "The source grid position is empty.");
      }
      if (findHex(design.hexes, command.to)) {
        return failure("position-occupied", "The target position is occupied.");
      }
      if (design.footprint.length === 0) {
        return failure(
          "invalid-footprint",
          "Create the board border before moving terrain.",
        );
      }
      if (
        !design.footprint.some((coordinate) =>
          sameCoordinate(coordinate, command.to),
        )
      ) {
        return failure(
          "invalid-footprint",
          "Move tiles inside the current board border.",
        );
      }
      const hexes = design.hexes.map((hex) =>
        sameCoordinate(hex.coordinate, command.from)
          ? { ...hex, coordinate: { ...command.to } }
          : hex,
      );
      return success({
        ...design,
        hexes,
        ports: removeInvalidPorts(design.ports, hexes),
      });
    }

    case "numberToken.set": {
      const target = findHex(design.hexes, command.coordinate);
      if (!target) {
        return failure("position-empty", "That grid position is empty.");
      }
      if (!isProducingTerrain(target.terrain)) {
        return failure(
          "invalid-number-target",
          "Number tokens can only be placed on producing terrain.",
        );
      }
      if (target.numberToken === command.value) {
        return success(design);
      }
      if (command.value !== null) {
        const placed = placedInventory(design);
        const alreadyOnTarget = target.numberToken === command.value ? 1 : 0;
        if (
          placed.numbers[command.value] - alreadyOnTarget >=
          design.inventory.numbers[command.value]
        ) {
          return failure(
            "inventory-exhausted",
            "No matching number token remains in the inventory.",
          );
        }
      }
      return success({
        ...design,
        hexes: design.hexes.map((hex) =>
          sameCoordinate(hex.coordinate, command.coordinate)
            ? { ...hex, numberToken: command.value }
            : hex,
        ),
      });
    }

    case "port.set": {
      const key = edgeKey(command.landCoordinate, command.direction);
      const withoutTarget = design.ports.filter(
        (port) => edgeKey(port.landCoordinate, port.direction) !== key,
      );
      if (command.portType === null) {
        return success({ ...design, ports: withoutTarget });
      }

      const candidate: BoardPort = {
        landCoordinate: { ...command.landCoordinate },
        direction: command.direction,
        type: command.portType,
      };
      if (!isValidPortPlacement(candidate, design.hexes)) {
        return failure(
          "invalid-port-target",
          "Ports must face a sea hex from an adjacent land hex.",
        );
      }
      const used = withoutTarget.filter(
        (port) => port.type === command.portType,
      ).length;
      if (used >= design.inventory.ports[command.portType]) {
        return failure(
          "inventory-exhausted",
          "No matching port remains in the inventory.",
        );
      }
      return success({ ...design, ports: [...withoutTarget, candidate] });
    }

    case "footprint.replaced": {
      if (!validFootprint(command.coordinates)) {
        return failure(
          "invalid-footprint",
          "The board border must be connected and 180-degree symmetric.",
        );
      }
      const footprintKeys = new Set(command.coordinates.map(coordinateKey));
      const hexes = design.hexes.filter((hex) =>
        footprintKeys.has(coordinateKey(hex.coordinate)),
      );
      return success({
        ...design,
        footprint: command.coordinates.map((coordinate) => ({
          ...coordinate,
        })),
        hexes,
        ports: removeInvalidPorts(design.ports, hexes),
      });
    }

    case "footprint.pairAdded": {
      const pair = findSymmetricPair(
        symmetricExpansionPairs(design.footprint),
        command.coordinate,
      );
      if (!pair) {
        return failure(
          "invalid-footprint",
          "That mirrored border pair cannot be added.",
        );
      }
      return success({
        ...design,
        footprint: appendPair(design.footprint, pair),
      });
    }

    case "footprint.pairRemoved": {
      const pair = findSymmetricPair(
        symmetricRemovalPairs(design.footprint),
        command.coordinate,
      );
      if (!pair) {
        return failure(
          "invalid-footprint",
          "That mirrored border pair cannot be removed.",
        );
      }
      const footprint = removePair(design.footprint, pair);
      const footprintKeys = new Set(footprint.map(coordinateKey));
      const hexes = design.hexes.filter((hex) =>
        footprintKeys.has(coordinateKey(hex.coordinate)),
      );
      return success({
        ...design,
        footprint,
        hexes,
        ports: removeInvalidPorts(design.ports, hexes),
      });
    }

    case "layout.replaced": {
      if (design.footprint.length === 0 || !validFootprint(design.footprint)) {
        return failure(
          "invalid-footprint",
          "Create a connected 180-degree symmetric border before replacing the layout.",
        );
      }
      if (
        !inventoryFitsDesign(design.inventory, {
          hexes: command.layout.hexes,
          ports: command.layout.ports,
        }) ||
        command.layout.ports.some(
          (port) => !isValidPortPlacement(port, command.layout.hexes),
        )
      ) {
        return failure(
          "invalid-layout",
          "The generated layout does not fit the selected inventory.",
        );
      }
      const footprintKeys = new Set(design.footprint.map(coordinateKey));
      if (
        (command.layout.hexes.length > 0 &&
          (design.footprint.length !== totalTerrain(design.inventory) ||
            command.layout.hexes.length !== design.footprint.length)) ||
        command.layout.hexes.some(
          (hex) => !footprintKeys.has(coordinateKey(hex.coordinate)),
        )
      ) {
        return failure(
          "invalid-footprint",
          "The generated layout falls outside the current board border.",
        );
      }
      return success({
        ...design,
        hexes: command.layout.hexes.map((hex) => ({
          ...hex,
          coordinate: { ...hex.coordinate },
        })),
        ports: command.layout.ports.map((port) => ({
          ...port,
          landCoordinate: { ...port.landCoordinate },
        })),
      });
    }
  }
}
