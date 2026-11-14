import { createHash } from "node:crypto";
import path from "node:path";
import type {
  LogoUpload,
  ThemeLogos,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import { isString } from "./scalar-guards";
import { LOGO_SLOTS, logoPaths, slotAccepts } from "./theme-app-config";
import { THEME_MODES } from "./theme-stylesheet";
import { sanitizeSvg } from "./theme-svg";

export const LOGO_UPLOAD_DIRECTORY = "branding";
/** Served as static files by the frontend; relative to the theme root. */
export const PUBLIC_DIRECTORY = "public";

const MAX_LOGO_BYTES = 512 * 1024;
const HASH_LENGTH = 8;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const ICO_SIGNATURE = Buffer.from([0x00, 0x00, 0x01, 0x00]);
const RIFF_SIGNATURE = Buffer.from("RIFF");
const WEBP_SIGNATURE = Buffer.from("WEBP");
const WEBP_SIGNATURE_OFFSET = 8;
const SVG_ROOT = /<svg[\s>]/i;

interface LogoFormat {
  extension: string;
  matches: (bytes: Buffer) => boolean;
}

function startsWith(bytes: Buffer, signature: Buffer, offset = 0): boolean {
  return bytes.subarray(offset, offset + signature.length).equals(signature);
}

function isSvg(bytes: Buffer): boolean {
  return SVG_ROOT.test(bytes.toString("utf8"));
}

function isWebp(bytes: Buffer): boolean {
  return (
    startsWith(bytes, RIFF_SIGNATURE) &&
    startsWith(bytes, WEBP_SIGNATURE, WEBP_SIGNATURE_OFFSET)
  );
}

function isIcon(bytes: Buffer): boolean {
  return startsWith(bytes, ICO_SIGNATURE);
}

const LOGO_FORMATS = new Map<string, LogoFormat>([
  ["image/svg+xml", { extension: "svg", matches: isSvg }],
  [
    "image/png",
    {
      extension: "png",
      matches: (bytes) => startsWith(bytes, PNG_SIGNATURE),
    },
  ],
  [
    "image/jpeg",
    {
      extension: "jpg",
      matches: (bytes) => startsWith(bytes, JPEG_SIGNATURE),
    },
  ],
  ["image/webp", { extension: "webp", matches: isWebp }],
  ["image/x-icon", { extension: "ico", matches: isIcon }],
  ["image/vnd.microsoft.icon", { extension: "ico", matches: isIcon }],
]);

const LOGO_EXTENSIONS = [
  ...new Set([...LOGO_FORMATS.values()].map((format) => format.extension)),
];

/**
 * Matches the paths the builder gives its uploads. Only matching files are
 * ever deleted: a file the author put in `public/` by hand is not the
 * builder's to remove.
 */
const OWNED_ASSET = new RegExp(
  `^/${LOGO_UPLOAD_DIRECTORY}/(?:${LOGO_SLOTS.join("|")})-(?:${THEME_MODES.join("|")})-[0-9a-f]{${HASH_LENGTH}}\\.(?:${LOGO_EXTENSIONS.join("|")})$`,
);

/** A logo file checked and named, ready to be written. */
export interface StagedLogo {
  upload: LogoUpload;
  publicPath: string;
  filePath: string;
  bytes: Buffer;
  hadActiveContent: boolean;
}

/** The uploads of a draft, each either staged or refused. */
export interface StagedLogos {
  stagedLogos: StagedLogo[];
  issues: ValidationIssue[];
}

function uploadProblem(upload: LogoUpload, bytes: Buffer): string | undefined {
  const format = LOGO_FORMATS.get(upload.contentType);
  if (!format) {
    return `${upload.contentType} is not an accepted logo format (SVG, PNG, JPEG, WebP or ICO)`;
  }
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) {
    return `a logo must hold between 1 byte and ${MAX_LOGO_BYTES / 1024} KiB`;
  }
  if (!slotAccepts(upload.slot, format.extension)) {
    return `the ${upload.slot} logo must be a PNG or a JPEG: mail clients show no other image`;
  }
  return format.matches(bytes)
    ? undefined
    : `the file is not a ${format.extension.toUpperCase()} image`;
}

function slotAndModeProblem(upload: LogoUpload): string | undefined {
  const knownSlot = LOGO_SLOTS.some((slot) => slot === upload.slot);
  const knownMode = THEME_MODES.some((mode) => mode === upload.mode);
  return knownSlot && knownMode
    ? undefined
    : `${upload.slot} ${upload.mode} is not a logo slot and mode`;
}

/**
 * An SVG sanitized (its file name hashes these bytes), any other format
 * unchanged. Returns the sanitizer's reason when the sanitized SVG is empty or
 * not one well-formed `<svg>`.
 */
function bytesToWrite(
  bytes: Buffer,
  extension: string,
): { bytes: Buffer; hadActiveContent: boolean } | string {
  if (extension !== "svg") {
    return { bytes, hadActiveContent: false };
  }
  const { svg, hadActiveContent, invalidReason } = sanitizeSvg(
    bytes.toString("utf8"),
  );
  return invalidReason ?? { bytes: Buffer.from(svg, "utf8"), hadActiveContent };
}

/** A checked upload named after its content, or why it cannot be written. */
function stageLogo(
  publicDirectory: string,
  upload: LogoUpload,
  received: Buffer,
): StagedLogo | string {
  const extension = LOGO_FORMATS.get(upload.contentType)?.extension ?? "";
  const content = bytesToWrite(received, extension);
  if (isString(content)) {
    return content;
  }
  const hash = createHash("sha256").update(content.bytes).digest("hex");
  const name = `${upload.slot}-${upload.mode}-${hash.slice(0, HASH_LENGTH)}.${extension}`;
  const publicPath = `/${LOGO_UPLOAD_DIRECTORY}/${name}`;
  return {
    upload,
    publicPath,
    filePath: path.join(publicDirectory, publicPath),
    ...content,
  };
}

/**
 * The first staged logo with the same bytes and extension, whose file a later
 * upload reuses instead of writing a copy (the simple editor puts one logo in
 * every slot).
 */
function findIdenticalStagedLogo(
  stagedLogos: StagedLogo[],
  logo: StagedLogo,
): StagedLogo | undefined {
  return stagedLogos.find(
    (other) =>
      path.extname(other.filePath) === path.extname(logo.filePath) &&
      other.bytes.equals(logo.bytes),
  );
}

/**
 * Drops each upload that a later one replaces for the same slot and mode:
 * only the last reaches the app config, and an earlier one's file would never
 * be cleaned up.
 */
function lastPerSlotAndMode(stagedLogos: StagedLogo[]): StagedLogo[] {
  return stagedLogos.filter(
    (logo, index) =>
      !stagedLogos
        .slice(index + 1)
        .some(
          (later) =>
            later.upload.slot === logo.upload.slot &&
            later.upload.mode === logo.upload.mode,
        ),
  );
}

/**
 * Checks every upload and names its file after its content, so a new logo
 * gets a new URL: no browser or CDN keeps serving the old one under the path
 * the app config points at.
 */
export function stageLogos(
  publicDirectory: string,
  uploads: LogoUpload[],
): StagedLogos {
  const stagedLogos: StagedLogo[] = [];
  const issues: ValidationIssue[] = [];
  uploads.forEach((upload, index) => {
    const received = Buffer.from(upload.base64Content, "base64");
    const problem =
      slotAndModeProblem(upload) ?? uploadProblem(upload, received);
    const stagedOrProblem =
      problem ?? stageLogo(publicDirectory, upload, received);
    if (isString(stagedOrProblem)) {
      issues.push({ pointer: `/uploads/${index}`, message: stagedOrProblem });
      return;
    }
    const twin = findIdenticalStagedLogo(stagedLogos, stagedOrProblem);
    stagedLogos.push(
      twin
        ? {
            ...stagedOrProblem,
            publicPath: twin.publicPath,
            filePath: twin.filePath,
          }
        : stagedOrProblem,
    );
  });
  return { stagedLogos: lastPerSlotAndMode(stagedLogos), issues };
}

/**
 * The draft's logos, each staged upload's path replacing the draft's for its
 * slot and mode.
 */
export function withUploads(
  logos: ThemeLogos,
  stagedLogos: StagedLogo[],
): ThemeLogos {
  const merged: ThemeLogos = structuredClone(logos);
  for (const logo of stagedLogos) {
    const { slot, mode } = logo.upload;
    merged[slot] = { ...merged[slot], [mode]: logo.publicPath };
  }
  return merged;
}

/**
 * Absolute paths of builder-named logo files the previous logos used and whose
 * file name no string the saved app config reaches contains: a slot may reach
 * a file through a constant the logos do not read, in the app config or a file
 * it imports, or through a path it builds at runtime around that file name.
 */
export function orphanedAssets(
  publicDirectory: string,
  previousLogos: ThemeLogos,
  keptStrings: ReadonlySet<string>,
): string[] {
  const reached = [...keptStrings];
  return [...new Set(logoPaths(previousLogos))]
    .filter(
      (publicPath) =>
        OWNED_ASSET.test(publicPath) &&
        !reached.some((text) => text.includes(path.posix.basename(publicPath))),
    )
    .map((publicPath) => path.join(publicDirectory, publicPath));
}
