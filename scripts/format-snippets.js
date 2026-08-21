const fs = require("fs");
const path = require("path");

const snippetFiles = [
  path.join(__dirname, "..", "src", "seedSnippets.json"),
  path.join(__dirname, "..", "src", "generalSnippets.json"),
];

function stripBom(value) {
  return value.replace(/^\uFEFF/, "");
}

function looksLikeJson(value) {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function normalizeSnippetContent(value) {
  let content = stripBom(String(value || "")).replace(/\r\n?/g, "\n");

  if (looksLikeJson(content)) {
    try {
      content = JSON.stringify(JSON.parse(content), null, 2);
    } catch (error) {
      // Some snippets are partial code blocks, so keep them as text.
    }
  }

  return content
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}$/g, "\n\n")
    .trim();
}

for (const file of snippetFiles) {
  const raw = stripBom(fs.readFileSync(file, "utf8"));
  const snippets = JSON.parse(raw).map((snippet) => ({
    ...snippet,
    title: String(snippet.title || "").trim(),
    category: String(snippet.category || "").trim(),
    filename: String(snippet.filename || "").trim(),
    content: normalizeSnippetContent(snippet.content),
  }));

  fs.writeFileSync(file, `${JSON.stringify(snippets, null, 2)}\n`, "utf8");
  console.log(`Formatted ${snippets.length} snippets in ${path.basename(file)}`);
}
