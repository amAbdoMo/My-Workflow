const fs = require("fs");
const path = require("path");

const ROOT_SOURCE = "C:\\Users\\COMPUMARTS\\Desktop\\CSS & JS";
const WOOCOMMERCE_SOURCE = path.join(ROOT_SOURCE, "Woocommerce");

const OUTPUTS = [
  {
    source: WOOCOMMERCE_SOURCE,
    output: path.join(__dirname, "..", "src", "seedSnippets.json"),
    category: "WooCommerce",
    idPrefix: "woocommerce",
  },
  {
    source: ROOT_SOURCE,
    output: path.join(__dirname, "..", "src", "generalSnippets.json"),
    category: "General",
    idPrefix: "general",
    rootOnly: true,
  },
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniqueId(base, usedIds) {
  let id = base;
  let index = 2;

  while (usedIds.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }

  usedIds.add(id);
  return id;
}

function decodeText(file) {
  const bytes = fs.readFileSync(file);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.slice(3));
  }

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.slice(2));
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.slice(2));
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    return new TextDecoder("windows-1256").decode(bytes);
  }
}

function normalizeContent(content) {
  return content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

function collectFiles(source, rootOnly) {
  return fs
    .readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isFile() || (!rootOnly && entry.isDirectory()))
    .flatMap((entry) => {
      const fullPath = path.join(source, entry.name);
      if (entry.isDirectory()) return collectFiles(fullPath, false);
      return fullPath;
    })
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

const usedIds = new Set();
const now = "2026-04-27T00:00:00.000Z";

for (const config of OUTPUTS) {
  const snippets = collectFiles(config.source, config.rootOnly).map((file) => {
    const filename = path.basename(file);
    const title = filename.replace(/\.[^.]+$/, "");
    const id = uniqueId(`${config.idPrefix}-${slugify(title) || "snippet"}`, usedIds);

    return {
      id,
      title,
      category: config.category,
      filename,
      content: normalizeContent(decodeText(file)),
      createdAt: now,
      updatedAt: now,
    };
  });

  fs.writeFileSync(config.output, `${JSON.stringify(snippets, null, 2)}\n`, "utf8");
  console.log(`Imported ${snippets.length} ${config.category} snippets`);
}
