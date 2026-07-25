import type { BoardDesign, BoardDesignId, IsoTimestamp } from "../domain";

export const BOARD_DESIGN_DATABASE_VERSION = 1;
export const BOARD_DESIGN_EXPORT_VERSION = 1;
export const BOARD_DESIGN_EXPORT_FORMAT = "catan-table-companion-board-design";

export interface BoardDesignExportDocument {
  format: typeof BOARD_DESIGN_EXPORT_FORMAT;
  exportVersion: typeof BOARD_DESIGN_EXPORT_VERSION;
  exportedAt: IsoTimestamp;
  applicationVersion: string;
  design: BoardDesign;
}

export interface BoardDesignList {
  designs: BoardDesign[];
  invalidCount: number;
}

export interface BoardDesignRepository {
  initialize(): Promise<void>;
  listDesigns(): Promise<BoardDesignList>;
  loadDesign(id: BoardDesignId): Promise<BoardDesign | null>;
  saveDesign(
    design: BoardDesign,
    expectedRevision: number | null,
  ): Promise<void>;
  deleteDesign(id: BoardDesignId, expectedRevision: number): Promise<void>;
}
