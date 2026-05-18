/**
 * Minimal cross-platform ZIP writer for `extforge package`.
 *
 * The CLI prefers the system `zip` binary (faster, well-tested) but on
 * Windows hosts that binary isn't usually present. This writer is the
 * fallback: a pure-Node implementation that produces a deterministic
 * ZIP — fixed DOS timestamp, sorted entries, DEFLATE-compressed bodies
 * via `node:zlib`. No third-party dependency.
 *
 * Scope: just enough for the browser-extension store upload case. We
 * don't support encryption, ZIP64, multi-disk, or file attributes
 * beyond the bare minimum the stores need.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const SIG_LOCAL = 0x04034b50;
const SIG_CDIR = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const VERSION_NEEDED = 20; // ZIP 2.0 — DEFLATE support
const METHOD_DEFLATE = 8;
// Fixed DOS date/time (1980-01-01 00:00:00) so the archive is byte-for-byte
// reproducible across runs. Stores don't care about file mtimes inside the
// zip; deterministic output makes CI artefact diffing trivial.
const DOS_DATE = ((1980 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

// Table-driven CRC-32 (IEEE 802.3 polynomial 0xedb88320). Built once on
// module load; computing on demand for every file is far slower than the
// ~1 KiB table cost.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  /** Path inside the archive — forward-slashes, no leading slash. */
  name: string;
  /** Raw file contents. */
  body: Buffer;
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const d = stack.pop()!;
    let entries: import('node:fs').Dirent[];
    try { entries = readdirSync(d, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      // Match what the system `zip -r .` excludes by default. Extension
      // stores reject archives containing .DS_Store and reviewers flag
      // .git directories.
      if (e.name === '.DS_Store' || e.name === '.git') continue;
      const full = join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) out.push(full);
    }
  }
  return out;
}

/**
 * Write a deterministic DEFLATE-compressed ZIP containing every file
 * under `srcDir` (recursively) to `archivePath`. Entries are sorted by
 * archive path so the output is byte-for-byte reproducible.
 */
export function writeZip(srcDir: string, archivePath: string): void {
  const files = walkFiles(srcDir);
  // Archive paths use forward-slashes regardless of host OS.
  const entries: ZipEntry[] = files
    .map((abs) => ({
      name: relative(srcDir, abs).replace(/\\/g, '/'),
      body: readFileSync(abs),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;
  let totalEntries = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.body);
    const compressed = deflateRawSync(entry.body, { level: 9 });
    const uncompressedSize = entry.body.length;
    const compressedSize = compressed.length;
    // General-purpose bit flag 0x0800 marks UTF-8 filename encoding.
    const gpFlag = 0x0800;

    // Local file header (30 bytes + name)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(gpFlag, 6);
    local.writeUInt16LE(METHOD_DEFLATE, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    localChunks.push(local, nameBuf, compressed);

    // Central directory entry (46 bytes + name)
    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CDIR, 0);
    central.writeUInt16LE(VERSION_NEEDED, 4); // version made by
    central.writeUInt16LE(VERSION_NEEDED, 6); // version needed
    central.writeUInt16LE(gpFlag, 8);
    central.writeUInt16LE(METHOD_DEFLATE, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressedSize, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBuf);

    offset += 30 + nameBuf.length + compressedSize;
    totalEntries++;
  }

  const centralStart = offset;
  const localBlob = Buffer.concat(localChunks);
  const centralBlob = Buffer.concat(centralChunks);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4); // this disk number
  eocd.writeUInt16LE(0, 6); // disk with start of central directory
  eocd.writeUInt16LE(totalEntries, 8);
  eocd.writeUInt16LE(totalEntries, 10);
  eocd.writeUInt32LE(centralBlob.length, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  writeFileSync(archivePath, Buffer.concat([localBlob, centralBlob, eocd]));
}
