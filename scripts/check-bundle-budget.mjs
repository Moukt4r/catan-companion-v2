import { gzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.cwd(), "dist");
const indexPath = path.join(distDir, "index.html");

const budgets = {
  javascript: 250 * 1024,
  css: 50 * 1024,
};

if (!existsSync(indexPath)) {
  console.error(
    "Bundle budget check requires dist/index.html. Run `pnpm build` first.",
  );
  process.exit(1);
}

const indexHtml = readFileSync(indexPath, "utf8");
const initialCss = collectHtmlAssets(indexHtml, "href", ".css");
const entryJs = collectHtmlAssets(indexHtml, "src", ".js");
const initialJs = resolveInitialJs(entryJs);

const javascript = summarizeAssets(initialJs);
const css = summarizeAssets(initialCss);

printGroup(
  "Initial JavaScript",
  javascript.files,
  javascript.totalGzip,
  budgets.javascript,
);
printGroup("Initial CSS", css.files, css.totalGzip, budgets.css);

const failures = [];
if (javascript.totalGzip > budgets.javascript) {
  failures.push(
    `Initial JavaScript gzip size ${formatKiB(javascript.totalGzip)} exceeds budget ${formatKiB(budgets.javascript)}.`,
  );
}
if (css.totalGzip > budgets.css) {
  failures.push(
    `Initial CSS gzip size ${formatKiB(css.totalGzip)} exceeds budget ${formatKiB(budgets.css)}.`,
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`✗ ${failure}`);
  }
  process.exit(1);
}

console.log("✓ Bundle budgets passed.");

function collectHtmlAssets(html, attribute, suffix) {
  const expression = new RegExp(
    `${attribute}=["']([^"']+\\${suffix})["']`,
    "g",
  );
  const assets = new Set();
  let match;
  while ((match = expression.exec(html)) !== null) {
    const reference = match[1];
    const localPath = toDistPath(reference);
    if (localPath !== null) {
      assets.add(localPath);
    }
  }
  return [...assets].sort();
}

function resolveInitialJs(entries) {
  const queue = [...entries];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);

    const source = readFileSync(path.join(distDir, current), "utf8");
    const importExpression = /\bimport(?:[^"']*from\s*)?["']([^"']+\.js)["']/g;
    let match;
    while ((match = importExpression.exec(source)) !== null) {
      const specifier = match[1];
      const resolved = specifier.startsWith(".")
        ? path.posix.normalize(
            path.posix.join(path.posix.dirname(current), specifier),
          )
        : toDistPath(specifier);
      if (resolved !== null && !seen.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return [...seen].sort();
}

function summarizeAssets(relativePaths) {
  const files = relativePaths.map((relativePath) => {
    const file = readFileSync(path.join(distDir, relativePath));
    return {
      path: relativePath,
      rawBytes: file.length,
      gzipBytes: gzipSync(file).length,
    };
  });
  return {
    files,
    totalGzip: files.reduce((sum, file) => sum + file.gzipBytes, 0),
  };
}

function printGroup(label, files, totalGzip, budget) {
  console.log(`${label}:`);
  for (const file of files) {
    console.log(
      `  - ${file.path}: ${formatKiB(file.gzipBytes)} gzip (${formatKiB(file.rawBytes)} raw)`,
    );
  }
  console.log(
    `  Total: ${formatKiB(totalGzip)} gzip / budget ${formatKiB(budget)}`,
  );
}

function toDistPath(reference) {
  const assetIndex = reference.indexOf("/assets/");
  if (assetIndex >= 0) {
    return reference.slice(assetIndex + 1);
  }
  if (reference.startsWith("assets/")) {
    return reference;
  }
  return null;
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
