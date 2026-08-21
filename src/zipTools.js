const encoder = new TextEncoder();
const decoder = new TextDecoder();

let crcTable;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function readUint16(view, offset) {
  return view.getUint16(offset, true);
}

function readUint32(view, offset) {
  return view.getUint32(offset, true);
}

function sanitizePathPart(value) {
  return String(value || "Snippet")
    .split("")
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? "-" : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140) || "Snippet";
}

export function snippetFileName(snippet) {
  const category = sanitizePathPart(snippet.category || "Snippets");
  const title = sanitizePathPart(snippet.title || "Untitled snippet");
  return `${category}/${title}.txt`;
}

export function createZip(files) {
  const localBytes = [];
  const centralBytes = [];
  const records = [];

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content || "");
    const offset = localBytes.length;
    const checksum = crc32(contentBytes);

    writeUint32(localBytes, 0x04034b50);
    writeUint16(localBytes, 20);
    writeUint16(localBytes, 0);
    writeUint16(localBytes, 0);
    writeUint16(localBytes, 0);
    writeUint16(localBytes, 0);
    writeUint32(localBytes, checksum);
    writeUint32(localBytes, contentBytes.length);
    writeUint32(localBytes, contentBytes.length);
    writeUint16(localBytes, nameBytes.length);
    writeUint16(localBytes, 0);
    localBytes.push(...nameBytes, ...contentBytes);

    records.push({ nameBytes, contentBytes, checksum, offset });
  }

  const centralOffset = localBytes.length;

  for (const record of records) {
    writeUint32(centralBytes, 0x02014b50);
    writeUint16(centralBytes, 20);
    writeUint16(centralBytes, 20);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint32(centralBytes, record.checksum);
    writeUint32(centralBytes, record.contentBytes.length);
    writeUint32(centralBytes, record.contentBytes.length);
    writeUint16(centralBytes, record.nameBytes.length);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint32(centralBytes, 0);
    writeUint32(centralBytes, record.offset);
    centralBytes.push(...record.nameBytes);
  }

  const output = [...localBytes, ...centralBytes];
  writeUint32(output, 0x06054b50);
  writeUint16(output, 0);
  writeUint16(output, 0);
  writeUint16(output, records.length);
  writeUint16(output, records.length);
  writeUint32(output, centralBytes.length);
  writeUint32(output, centralOffset);
  writeUint16(output, 0);

  return new Blob([new Uint8Array(output)], { type: "application/zip" });
}

export async function readZip(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const files = [];
  let offset = 0;

  while (offset + 30 <= bytes.length && readUint32(view, offset) === 0x04034b50) {
    const method = readUint16(view, offset + 8);
    const compressedSize = readUint32(view, offset + 18);
    const uncompressedSize = readUint32(view, offset + 22);
    const fileNameLength = readUint16(view, offset + 26);
    const extraLength = readUint16(view, offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + fileNameLength + extraLength;
    const contentEnd = contentStart + compressedSize;

    if (method !== 0) {
      throw new Error("Only uncompressed ZIP files exported by this app can be imported.");
    }

    const name = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));
    const content = decoder.decode(bytes.slice(contentStart, contentEnd));

    if (!name.endsWith("/") && compressedSize === uncompressedSize) {
      files.push({ name, content });
    }

    offset = contentEnd;
  }

  return files;
}
