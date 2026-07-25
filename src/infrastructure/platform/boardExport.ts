import {
  NUMBER_TOKEN_PIPS,
  PORT_LABELS,
  TERRAIN_LABELS,
  hexCenter,
  hexCornerPoints,
  pixelBounds,
  portCenter,
  type BoardDesign,
  type TerrainType,
} from "../../domain";
import { downloadBlob, makeBoardDesignFilename } from "./files";

const HEX_SIZE = 72;
const TITLE_CHARACTER_WIDTH = 34;
const TERRAIN_COLORS: Record<TerrainType, string> = {
  forest: "#356b4b",
  pasture: "#9dbb69",
  fields: "#d9b94d",
  hills: "#8f472f",
  mountains: "#596565",
  gold: "#d7a928",
  desert: "#d8bd82",
  sea: "#2f6f88",
};

export function buildBoardSvg(design: BoardDesign): string {
  if (design.hexes.length === 0) {
    throw new Error("Place at least one hex before exporting the board.");
  }
  const boardBounds = pixelBounds(
    design.hexes.map((hex) => hex.coordinate),
    HEX_SIZE,
    52,
  );
  const width = Math.max(boardBounds.width, 640);
  const centerX = (boardBounds.minX + boardBounds.maxX) / 2;
  const titleLines = wrapTitle(
    design.name,
    Math.max(10, Math.floor((width - 44) / TITLE_CHARACTER_WIDTH)),
  );
  const titleHeight = titleLines.length * 34 + 22;
  const bounds = {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minY: boardBounds.minY - titleHeight,
    maxY: boardBounds.maxY,
    width,
    height: boardBounds.height + titleHeight,
  };
  const title = titleLines
    .map(
      (line, index) =>
        `<tspan x="${round(bounds.minX + 22)}" dy="${
          index === 0 ? 0 : 34
        }">${escapeXml(line)}</tspan>`,
    )
    .join("");
  const hexes = design.hexes
    .map((hex) => {
      const center = hexCenter(hex.coordinate, HEX_SIZE);
      const points = hexCornerPoints(hex.coordinate, HEX_SIZE)
        .map(({ x, y }) => `${round(x)},${round(y)}`)
        .join(" ");
      const number =
        hex.numberToken === null
          ? ""
          : `<g transform="translate(${round(center.x)} ${round(
              center.y + 17,
            )})">
  <circle r="25" fill="#fff7df" stroke="#443b2d" stroke-width="2"/>
  <text text-anchor="middle" y="-1" class="number${
    hex.numberToken === 6 || hex.numberToken === 8 ? " number-red" : ""
  }">${hex.numberToken}</text>
  <text text-anchor="middle" y="14" class="pips">${
    NUMBER_TOKEN_PIPS[hex.numberToken]
  } pips</text>
</g>`;
      return `<g>
  <polygon points="${points}" fill="${TERRAIN_COLORS[hex.terrain]}" stroke="#243a3b" stroke-width="3"/>
  <text x="${round(center.x)}" y="${round(
    center.y + (hex.numberToken === null ? 5 : -22),
  )}" text-anchor="middle" class="terrain terrain-${hex.terrain}">${escapeXml(
    TERRAIN_LABELS[hex.terrain],
  )}</text>
  ${number}
</g>`;
    })
    .join("\n");
  const ports = design.ports
    .map((port) => {
      const center = portCenter(port.landCoordinate, port.direction, HEX_SIZE);
      return `<g transform="translate(${round(center.x)} ${round(center.y)})">
  <rect x="-43" y="-15" width="86" height="30" rx="11" fill="#fff7df" stroke="#243a3b" stroke-width="2"/>
  <text text-anchor="middle" y="5" class="port">${escapeXml(
    PORT_LABELS[port.type],
  )}</text>
</g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(
    bounds.width,
  )}" height="${Math.ceil(bounds.height)}" viewBox="${round(
    bounds.minX,
  )} ${round(bounds.minY)} ${round(bounds.width)} ${round(bounds.height)}">
  <title>${escapeXml(design.name)}</title>
  <style>
    text { font-family: Inter, Arial, sans-serif; fill: #203236; }
    .title { font-family: Georgia, serif; font-size: 28px; font-weight: 700; }
    .terrain { font-size: 15px; font-weight: 800; }
    .terrain-forest, .terrain-hills, .terrain-mountains, .terrain-sea { fill: #fffdf7; }
    .number { font-size: 19px; font-weight: 900; }
    .number-red { fill: #9f2d2d; }
    .pips { font-size: 8px; font-weight: 700; }
    .port { font-size: 10px; font-weight: 800; }
  </style>
  <rect x="${round(bounds.minX)}" y="${round(
    bounds.minY,
  )}" width="${round(bounds.width)}" height="${round(
    bounds.height,
  )}" fill="#e9dfc9"/>
  <text x="${round(bounds.minX + 22)}" y="${round(
    bounds.minY + 36,
  )}" class="title">${title}</text>
  ${hexes}
  ${ports}
</svg>`;
}

export function downloadBoardSvg(design: BoardDesign): void {
  downloadBlob(
    new Blob([buildBoardSvg(design)], {
      type: "image/svg+xml;charset=utf-8",
    }),
    makeBoardDesignFilename(design.name, "svg"),
  );
}

export async function downloadBoardPng(design: BoardDesign): Promise<void> {
  const svg = buildBoardSvg(design);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const scale = Math.min(
      2,
      4096 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("PNG export is unavailable in this browser.");
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await canvasBlob(canvas);
    downloadBlob(png, makeBoardDesignFilename(design.name, "png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function printBoardDesign(design: BoardDesign): void {
  const frame = document.createElement("iframe");
  frame.title = `Print ${design.name}`;
  frame.style.position = "fixed";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.append(frame);
  const printDocument = frame.contentDocument;
  if (!printDocument) {
    frame.remove();
    throw new Error("Print preview could not be opened.");
  }
  printDocument.open();
  printDocument.write(`<!doctype html>
<html>
  <head>
    <title>${escapeXml(design.name)}</title>
    <style>
      @page { size: landscape; margin: 10mm; }
      html, body { margin: 0; background: white; }
      svg { width: 100%; height: 95vh; object-fit: contain; }
    </style>
  </head>
  <body>${buildBoardSvg(design)}</body>
</html>`);
  printDocument.close();
  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => {
      frame.remove();
    }, 1_000);
  }, 0);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error("The board image could not be rendered."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("The board PNG could not be created."));
      }
    }, "image/png");
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapTitle(value: string, maximumLength: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of value.trim().split(/\s+/)) {
    if (word.length > maximumLength) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let index = 0; index < word.length; index += maximumLength) {
        lines.push(word.slice(index, index + maximumLength));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maximumLength) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : ["Untitled island"];
}
