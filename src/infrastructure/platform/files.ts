export function downloadJson(
  document: unknown,
  filename: string,
  mimeType = "application/vnd.catan-table-companion.game+json",
): void {
  const contents = JSON.stringify(document, null, 2);
  const blob = new Blob([contents], { type: mimeType });
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readJsonFile(
  file: File,
  maxBytes = 10 * 1024 * 1024,
): Promise<unknown> {
  if (file.size > maxBytes) {
    throw new Error("The backup is larger than 10 MB.");
  }

  const text = await file.text();
  return JSON.parse(text) as unknown;
}

export function makeBackupFilename(title: string, date = new Date()): string {
  const slug = filenameSlug(title);
  const stamp = date.toISOString().slice(0, 10);
  return `catan-companion-${stamp}-${slug || "game"}.json`;
}

export function makeBoardDesignFilename(
  title: string,
  extension: "json" | "svg" | "png",
  date = new Date(),
): string {
  const slug = filenameSlug(title);
  const stamp = date.toISOString().slice(0, 10);
  return `catan-board-${stamp}-${slug || "island"}.${extension}`;
}

function filenameSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 48);
}
