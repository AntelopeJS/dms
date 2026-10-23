/**
 * Geist has no narrow no-break space (U+202F), the separator French groups
 * digits with: a fallback face drew it a fraction of a digit wide, so
 * "1 234" read as "1234". The bundled files map it to their no-break space
 * glyph (see the `@font-face` rules of main.css); a font update must keep it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const FONTS_DIR = resolve(__dirname, "../layers/dms-layout/app/assets/fonts");
const FONT_FILES = [
  "Geist-Variable.woff2",
  "Geist-Italic-Variable.woff2",
  "GeistMono-Variable.woff2",
  "GeistMono-Italic-Variable.woff2",
];
const NO_BREAK_SPACE = 0xa0;
const NARROW_NO_BREAK_SPACE = 0x202f;

// WOFF2 (https://www.w3.org/TR/WOFF2/): the known table tags by index, and
// the layout of its header and table directory.
const KNOWN_TAGS =
  "cmap head hhea hmtx maxp name OS/2 post cvt_ fpgm glyf loca prep CFF_ VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG_ sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill"
    .split(" ")
    .map((tag) => tag.replace("_", " "));
const HEADER_SIZE = 48;
const NUM_TABLES_OFFSET = 12;
const CUSTOM_TAG_INDEX = 63;
const TAG_INDEX_MASK = 0x3f;
const TRANSFORM_SHIFT = 6;
const UNICODE_PLATFORM = 0;
const WINDOWS_PLATFORM = 3;
const WINDOWS_UNICODE_BMP = 1;
const SEGMENT_MAPPING_FORMAT = 4;

function readBase128(data: Buffer, cursor: { at: number }): number {
  let value = 0;
  for (;;) {
    const byte = data[cursor.at++]!;
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
}

/** The `cmap` table of a WOFF2 file, which WOFF2 never transforms. */
function readCmap(file: Buffer): Buffer {
  const numTables = file.readUInt16BE(NUM_TABLES_OFFSET);
  const cursor = { at: HEADER_SIZE };
  const tables: { tag: string; length: number }[] = [];
  for (let index = 0; index < numTables; index++) {
    const flags = file[cursor.at++]!;
    const tagIndex = flags & TAG_INDEX_MASK;
    let tag = KNOWN_TAGS[tagIndex] ?? "";
    if (tagIndex === CUSTOM_TAG_INDEX) {
      tag = file.toString("latin1", cursor.at, cursor.at + 4);
      cursor.at += 4;
    }
    const transform = flags >> TRANSFORM_SHIFT;
    const originalLength = readBase128(file, cursor);
    // glyf and loca are transformed at version 0, any table at another one.
    const isTransformed =
      tag === "glyf" || tag === "loca" ? transform === 0 : transform !== 0;
    const length = isTransformed ? readBase128(file, cursor) : originalLength;
    tables.push({ tag, length });
  }
  const data = brotliDecompressSync(file.subarray(cursor.at));
  let offset = 0;
  for (const table of tables) {
    if (table.tag === "cmap")
      return data.subarray(offset, offset + table.length);
    offset += table.length;
  }
  throw new Error("no cmap table");
}

/** The glyph id of `codePoint` in the font's Unicode BMP subtable. */
function glyphOf(cmap: Buffer, codePoint: number): number {
  const count = cmap.readUInt16BE(2);
  for (let index = 0; index < count; index++) {
    const record = 4 + index * 8;
    const platform = cmap.readUInt16BE(record);
    const encoding = cmap.readUInt16BE(record + 2);
    const subtable = cmap.subarray(cmap.readUInt32BE(record + 4));
    const isUnicode =
      platform === UNICODE_PLATFORM ||
      (platform === WINDOWS_PLATFORM && encoding === WINDOWS_UNICODE_BMP);
    if (!isUnicode || subtable.readUInt16BE(0) !== SEGMENT_MAPPING_FORMAT)
      continue;
    const segments = subtable.readUInt16BE(6) / 2;
    const ends = 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const rangeOffsets = deltas + segments * 2;
    for (let segment = 0; segment < segments; segment++) {
      const end = subtable.readUInt16BE(ends + segment * 2);
      if (codePoint > end) continue;
      const start = subtable.readUInt16BE(starts + segment * 2);
      if (codePoint < start) return 0;
      const delta = subtable.readUInt16BE(deltas + segment * 2);
      const rangeOffsetAt = rangeOffsets + segment * 2;
      const rangeOffset = subtable.readUInt16BE(rangeOffsetAt);
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
      const glyph = subtable.readUInt16BE(
        rangeOffsetAt + rangeOffset + (codePoint - start) * 2,
      );
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  }
  throw new Error("no Unicode BMP subtable");
}

describe("bundled Geist fonts", () => {
  it.each(FONT_FILES)(
    "%s draws the narrow no-break space as its no-break space",
    (name) => {
      const cmap = readCmap(readFileSync(resolve(FONTS_DIR, name)));
      const noBreakSpace = glyphOf(cmap, NO_BREAK_SPACE);

      expect(noBreakSpace).not.toBe(0);
      expect(glyphOf(cmap, NARROW_NO_BREAK_SPACE)).toBe(noBreakSpace);
    },
  );
});
