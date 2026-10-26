import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";
import { z } from "zod";
import "./check-page-invariants.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LAYERS_DIR = join(ROOT, "layers");

function collectSources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    if (entry.isDirectory()) return collectSources(file);
    return /\.(vue|ts)$/.test(entry.name) ? [file] : [];
  });
}

const sources = collectSources(LAYERS_DIR).map((file) => ({
  file,
  source: readFileSync(file, "utf8"),
}));

function checkAccessibleNames() {
  const literals = sources.flatMap(({ file, source }) =>
    file.endsWith(".vue")
      ? [
          ...source.matchAll(
            /\s(?:aria-label|title)\s*=\s*(?:"[A-Za-z][^"{]*"|'[A-Za-z][^'{]*')/g,
          ),
        ].map((match) => `${relative(LAYERS_DIR, file)}:${match[0].trim()}`)
      : [],
  );
  assert.deepEqual(
    literals,
    [],
    "Bind aria-label and title to translated text",
  );
}

function checkPluginRegistration() {
  const manifests = ["dms.frontend.ts", "deferred-plugins.ts"]
    .map((file) => readFileSync(join(ROOT, file), "utf8"))
    .join("\n");
  const missing = [];
  for (const layer of readdirSync(LAYERS_DIR)) {
    const pluginsDir = join(LAYERS_DIR, layer, "app/plugins");
    if (!existsSync(pluginsDir)) continue;
    for (const file of readdirSync(pluginsDir).filter((name) =>
      name.endsWith(".ts"),
    )) {
      const plugin = `./layers/${layer}/app/plugins/${file.replace(/\.ts$/, "")}`;
      if (!manifests.includes(`"${plugin}"`)) missing.push(plugin);
    }
  }
  assert.deepEqual(
    missing,
    [],
    "Register layer plugins in a frontend manifest",
  );
}

function checkCompareModeLabels() {
  const source = readFileSync(
    resolve(ROOT, "../../interface-dms/src/base/data-types/compare-types.ts"),
    "utf8",
  );
  const modes = [
    ...source.matchAll(/@RegisterDataCompareMode\(\s*"([a-z_]+)"/g),
  ].map(([, id]) => id);
  assert.ok(
    modes.length > 0,
    "No compare modes found in the interface registry",
  );
  const missing = [];
  for (const locale of ["en-GB", "fr-FR"]) {
    const messages = JSON.parse(
      readFileSync(
        join(LAYERS_DIR, `dms-ui/i18n/locales/ui-${locale}.json`),
        "utf8",
      ),
    );
    for (const mode of modes) {
      if (!messages.dms.table.compare_mode[mode])
        missing.push(`${locale}:${mode}`);
    }
  }
  assert.deepEqual(missing, [], "Translate every registered compare mode");
}

function checkFormErrorSummaryLabels() {
  for (const locale of ["en-GB", "fr-FR"]) {
    const messages = JSON.parse(
      readFileSync(
        join(LAYERS_DIR, `dms-ui/i18n/locales/ui-${locale}.json`),
        "utf8",
      ),
    );
    const resolved = messages.dms?.form?.error_summary?.resolved;
    assert.ok(
      z.string().regex(/\S/).safeParse(resolved).success,
      `${locale}: translate dms.form.error_summary.resolved`,
    );
  }
}

function staticPrefix(key, source) {
  const resolved = key.replace(/\$\{(\w+)\}/g, (interpolation, name) => {
    const declaration = source.match(
      new RegExp(`\\bconst ${name} = ("[^"]*"|'[^']*'|\`[^\`$]*\`)`),
    );
    return declaration ? declaration[1].slice(1, -1) : interpolation;
  });
  return resolved.split("${")[0] ?? "";
}

function checkAsyncDataKeyOwners() {
  const owners = new Map();
  for (const { file, source } of sources) {
    for (const match of source.matchAll(
      /useDms(?:Lazy)?AsyncData\(\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g,
    )) {
      const prefix = staticPrefix(
        match[1] ?? match[2] ?? match[3] ?? "",
        source,
      );
      if (!prefix) continue;
      const files = owners.get(prefix) ?? new Set();
      files.add(relative(LAYERS_DIR, file));
      owners.set(prefix, files);
    }
  }
  const shared = [...owners]
    .filter(([, files]) => files.size > 1)
    .map(([prefix, files]) => `${prefix} -> ${[...files].join(", ")}`);
  assert.deepEqual(
    shared,
    [],
    "Declare each async data key prefix in one file",
  );
}

function checkAsyncDataScopeRegistration() {
  assert.match(
    readFileSync(join(ROOT, "dms.frontend.ts"), "utf8"),
    /registerPlugin\(asyncDataScopePlugin, \{ enforce: "pre" \}\)/,
    "Register asyncDataScopePlugin with enforce pre before module plugins read data",
  );
}

function checkFontAssetUrls() {
  const stylesheet = join(LAYERS_DIR, "dms-layout/app/assets/css/main.css");
  const urls = [
    ...readFileSync(stylesheet, "utf8").matchAll(
      /@font-face\s*{[^}]*?src:\s*url\("([^"]+)"\)/g,
    ),
  ].map(([, url]) => url);
  assert.ok(
    urls.length > 0,
    "No font-face URLs found in the layout stylesheet",
  );
  for (const url of urls) {
    assert.doesNotMatch(
      url,
      /^(?:\/|[a-z][a-z\d+.-]*:)/i,
      `${url} must be a relative font asset URL`,
    );
    assert.ok(
      existsSync(resolve(dirname(stylesheet), url)),
      `${url} must resolve to a bundled font asset`,
    );
  }
}

function checkOnboardingPageMeta() {
  assert.match(
    readFileSync(
      join(LAYERS_DIR, "dms-onboarding/app/custom-pages/onboarding.vue"),
      "utf8",
    ),
    /defineDmsPageMeta\(/,
    "Declare onboarding page meta so global middleware runs on direct loads",
  );
}

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

function readBase128(data, cursor) {
  let value = 0;
  for (;;) {
    const byte = data[cursor.at++];
    assert.notEqual(byte, undefined, "Truncated WOFF2 table directory");
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
}

function readCmap(file) {
  const numTables = file.readUInt16BE(NUM_TABLES_OFFSET);
  const cursor = { at: HEADER_SIZE };
  const tables = [];
  for (let index = 0; index < numTables; index++) {
    const flags = file[cursor.at++];
    const tagIndex = flags & TAG_INDEX_MASK;
    let tag = KNOWN_TAGS[tagIndex] ?? "";
    if (tagIndex === CUSTOM_TAG_INDEX) {
      tag = file.toString("latin1", cursor.at, cursor.at + 4);
      cursor.at += 4;
    }
    const transform = flags >> TRANSFORM_SHIFT;
    const originalLength = readBase128(file, cursor);
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

function glyphOf(cmap, codePoint) {
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

function checkGeistNarrowSpace() {
  for (const name of [
    "Geist-Variable.woff2",
    "Geist-Italic-Variable.woff2",
    "GeistMono-Variable.woff2",
    "GeistMono-Italic-Variable.woff2",
  ]) {
    const cmap = readCmap(
      readFileSync(join(LAYERS_DIR, "dms-layout/app/assets/fonts", name)),
    );
    const noBreakSpace = glyphOf(cmap, 0xa0);
    assert.notEqual(noBreakSpace, 0, `${name} has no no-break space glyph`);
    assert.equal(
      glyphOf(cmap, 0x202f),
      noBreakSpace,
      `${name} must map U+202F to its no-break space glyph`,
    );
  }
}

for (const [name, check] of [
  ["translated accessible names", checkAccessibleNames],
  ["layer plugin registration", checkPluginRegistration],
  ["compare mode labels", checkCompareModeLabels],
  ["form error summary labels", checkFormErrorSummaryLabels],
  ["async data key ownership", checkAsyncDataKeyOwners],
  ["async data scope registration", checkAsyncDataScopeRegistration],
  ["Geist narrow no-break spaces", checkGeistNarrowSpace],
  ["font asset URLs", checkFontAssetUrls],
  ["onboarding page meta", checkOnboardingPageMeta],
]) {
  try {
    check();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}
