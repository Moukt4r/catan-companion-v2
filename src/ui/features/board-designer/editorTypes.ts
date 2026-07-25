import type { NumberTokenValue, PortType, TerrainType } from "../../../domain";

export type BoardEditorTool =
  | { kind: "select" }
  | { kind: "move" }
  | { kind: "erase" }
  | { kind: "border-add" }
  | { kind: "border-remove" }
  | { kind: "terrain"; terrain: TerrainType }
  | { kind: "number"; value: NumberTokenValue }
  | { kind: "port"; portType: PortType };
