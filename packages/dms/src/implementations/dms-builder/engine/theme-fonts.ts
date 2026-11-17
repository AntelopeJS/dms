import fs from "node:fs";
import path from "node:path";
import type { ThemeVariableSets } from "@antelopejs/interface-dms-builder";
import { isString } from "./scalar-guards";
import { LOGO_UPLOAD_DIRECTORY } from "./theme-assets";
import {
  FONT_PACKAGES_URL,
  FONT_SUBSET_NAMES,
  FONT_SUBSETS,
  type FontSubset,
  HOSTED_FONTS,
  type HostedFont,
} from "./theme-font-catalog";
import type { FontFaceRule } from "./theme-stylesheet";

/** Under the logos' directory: `/branding/fonts/inter-5.3.0-latin-wght-normal.woff2`. */
const FONT_DIRECTORY = "fonts";
const FONT_STYLES = ["normal", "italic"] as const;
type FontStyle = (typeof FONT_STYLES)[number];

/**
 * A file name the builder gives what it downloads: the package and its
 * release, so a new release gets a new URL, then the subset and style for a
 * face, or the license. Only matching files are ever deleted.
 */
const OWNED_FONT_FILE =
  /^[a-z0-9]+(?:-[a-z0-9]+)*-\d+\.\d+\.\d+-(?:(?:latin|latin-ext)-wght-(?:normal|italic)\.woff2|OFL\.txt)$/;
const HOSTED_FACE_SOURCE = new RegExp(
  `^url\\("/${LOGO_UPLOAD_DIRECTORY}/${FONT_DIRECTORY}/([^"/]+\\.woff2)"\\) format\\("woff2"\\)$`,
);

const WOFF2_SIGNATURE = Buffer.from("wOF2");
const MAX_FACE_BYTES = 2 * 1024 * 1024;
const MAX_LICENSE_BYTES = 64 * 1024;
/** Every license Fontsource ships with an OFL font says so. */
const OFL_NAME = "SIL Open Font License";
const DOWNLOAD_TIMEOUT_MS = 20_000;

/** A file a hosted font needs, where it is written and where it comes from. */
interface FontFile {
  font: HostedFont;
  filePath: string;
  sourceUrl: string;
  /** Why the bytes are not what the file should hold, if they are not. */
  problemOf: (bytes: Buffer) => string | undefined;
}

/** A file downloaded and checked, ready to be written. */
export interface DownloadedFontFile {
  filePath: string;
  bytes: Buffer;
}

function unquoted(name: string): string {
  const quote = name[0];
  return (quote === '"' || quote === "'") && name.endsWith(quote)
    ? name.slice(1, -1)
    : name;
}

/** The family a font stack starts with, the one the text shows in. */
function leadingFamily(value: string): string {
  return unquoted(value.split(",")[0]?.trim() ?? "").toLowerCase();
}

/**
 * The fonts of the catalog a variable's value starts with, in catalog order:
 * those the theme hosts. A font named further down a stack is a fallback the
 * page never reaches while the first one loads, so it is not downloaded.
 */
export function hostedFontsOf(variables: ThemeVariableSets): HostedFont[] {
  const families = new Set(
    [variables.shared, variables.light, variables.dark].flatMap((set) =>
      Object.values(set ?? {}).map(leadingFamily),
    ),
  );
  return HOSTED_FONTS.filter((font) => families.has(font.family.toLowerCase()));
}

function stylesOf(font: HostedFont): FontStyle[] {
  return font.italic ? [...FONT_STYLES] : ["normal"];
}

function subsets(): FontSubset[] {
  return [...FONT_SUBSET_NAMES];
}

function fileStem(font: HostedFont): string {
  return `${font.packageName}-${font.version}`;
}

function packageUrl(font: HostedFont): string {
  return `${FONT_PACKAGES_URL}/${font.packageName}@${font.version}`;
}

function faceFileName(
  font: HostedFont,
  subset: FontSubset,
  style: FontStyle,
): string {
  return `${fileStem(font)}-${subset}-wght-${style}.woff2`;
}

function facePublicPath(
  font: HostedFont,
  subset: FontSubset,
  style: FontStyle,
): string {
  return `/${LOGO_UPLOAD_DIRECTORY}/${FONT_DIRECTORY}/${faceFileName(font, subset, style)}`;
}

/** The theme's `public/branding/fonts`, absolute. */
function fontDirectory(publicDirectory: string): string {
  return path.join(publicDirectory, LOGO_UPLOAD_DIRECTORY, FONT_DIRECTORY);
}

function faceProblem(bytes: Buffer): string | undefined {
  if (bytes.length === 0 || bytes.length > MAX_FACE_BYTES) {
    return `holds ${bytes.length} bytes, not between 1 byte and ${MAX_FACE_BYTES / 1024 / 1024} MiB`;
  }
  return bytes.subarray(0, WOFF2_SIGNATURE.length).equals(WOFF2_SIGNATURE)
    ? undefined
    : "is not a WOFF2 font";
}

function licenseProblem(bytes: Buffer): string | undefined {
  return bytes.length <= MAX_LICENSE_BYTES &&
    bytes.toString("utf8").includes(OFL_NAME)
    ? undefined
    : `is not the ${OFL_NAME} the font should come with`;
}

/** Every face of every font, then the font's license beside them. */
function fontFiles(fonts: HostedFont[], publicDirectory: string): FontFile[] {
  const directory = fontDirectory(publicDirectory);
  return fonts.flatMap((font) => [
    ...stylesOf(font).flatMap((style) =>
      subsets().map((subset): FontFile => ({
        font,
        filePath: path.join(directory, faceFileName(font, subset, style)),
        sourceUrl: `${packageUrl(font)}/files/${font.packageName}-${subset}-wght-${style}.woff2`,
        problemOf: faceProblem,
      })),
    ),
    {
      font,
      filePath: path.join(directory, `${fileStem(font)}-OFL.txt`),
      sourceUrl: `${packageUrl(font)}/LICENSE`,
      problemOf: licenseProblem,
    },
  ]);
}

/** One rule per style and subset: the browser picks the file by the characters it shows. */
export function fontFaceRules(fonts: HostedFont[]): FontFaceRule[] {
  return fonts.flatMap((font) =>
    stylesOf(font).flatMap((style) =>
      subsets().map((subset): FontFaceRule => [
        ["font-family", `"${font.family}"`],
        ["font-style", style],
        ["font-weight", `${font.weights[0]} ${font.weights[1]}`],
        ["font-display", "swap"],
        [
          "src",
          `url("${facePublicPath(font, subset, style)}") format("woff2")`,
        ],
        ["unicode-range", FONT_SUBSETS[subset]],
      ]),
    ),
  );
}

/**
 * Whether a rule read from the stylesheet is one the builder wrote: its
 * source is a file the builder names. A save writes these anew from the
 * fonts the variables name; any other would be lost, so the stylesheet is
 * not the builder's to rewrite.
 */
export function isHostedFontFace(descriptors: FontFaceRule): boolean {
  const source = descriptors.find(([descriptor]) => descriptor === "src")?.[1];
  const fileName = source ? HOSTED_FACE_SOURCE.exec(source)?.[1] : undefined;
  return fileName !== undefined && OWNED_FONT_FILE.test(fileName);
}

async function download(url: string): Promise<Buffer | string> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    return response.ok
      ? Buffer.from(await response.arrayBuffer())
      : `HTTP ${response.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Downloads the files of `fonts` the layer does not hold yet, checked: a face
 * must be a WOFF2 font, a license the OFL. A font whose files are all there
 * costs no request, so a theme that keeps its font saves offline. Returns why
 * the first file that failed could not be had, and nothing is then written.
 */
export async function downloadMissingFontFiles(
  fonts: HostedFont[],
  publicDirectory: string,
): Promise<DownloadedFontFile[] | string> {
  const missing = fontFiles(fonts, publicDirectory).filter(
    (file) => !fs.existsSync(file.filePath),
  );
  const results = await Promise.all(
    missing.map(async (file) => {
      const bytesOrReason = await download(file.sourceUrl);
      if (isString(bytesOrReason)) {
        return fontFailure(
          file,
          `could not be downloaded from ${new URL(file.sourceUrl).host} (${bytesOrReason})`,
        );
      }
      const problem = file.problemOf(bytesOrReason);
      return problem
        ? fontFailure(file, problem)
        : { filePath: file.filePath, bytes: bytesOrReason };
    }),
  );
  const failure = results.find(isString);
  if (failure !== undefined) {
    return failure;
  }
  return results.filter(
    (result): result is DownloadedFontFile => !isString(result),
  );
}

/** Why a font file could not be had, with the way out. */
function fontFailure(
  file: { font: HostedFont; sourceUrl: string },
  problem: string,
): string {
  return `${file.font.family}: ${path.basename(file.sourceUrl)} ${problem}. Save again once the network is back, or pick another font`;
}

/**
 * Absolute paths of the font files the builder downloaded that `fonts` no
 * longer use. A file the author put there by hand is left alone.
 */
export function orphanedFontFiles(
  fonts: HostedFont[],
  publicDirectory: string,
): string[] {
  const directory = fontDirectory(publicDirectory);
  if (!fs.existsSync(directory)) {
    return [];
  }
  const kept = new Set(
    fontFiles(fonts, publicDirectory).map((file) => file.filePath),
  );
  return fs
    .readdirSync(directory)
    .filter((name) => OWNED_FONT_FILE.test(name))
    .map((name) => path.join(directory, name))
    .filter((filePath) => !kept.has(filePath));
}
