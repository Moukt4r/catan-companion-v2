export function downloadJson(document: unknown, filename: string): void {
  const contents = JSON.stringify(document, null, 2);
  const blob = new Blob([contents], {
    type: "application/vnd.catan-table-companion.game+json",
  });
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
  const slug = title
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 48);
  const stamp = date.toISOString().slice(0, 10);
  return `catan-companion-${stamp}-${slug || "game"}.json`;
}
