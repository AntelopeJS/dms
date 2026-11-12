import type {
  LogoSlot,
  ThemeDraft,
  ThemeLogos,
  ThemeMode,
} from "./theme-types";
import { THEME_MODES } from "./theme-types";

export const LOGO_SLOTS: readonly LogoSlot[] = [
  "default",
  "collapsed",
  "email",
  "favicon",
];

/** Slots the simple mode's logo always fills. */
export const WIDE_LOGO_SLOTS: readonly LogoSlot[] = ["default", "email"];
/** Slots the simple mode's square icon fills, or its logo when it has no icon. */
export const SQUARE_LOGO_SLOTS: readonly LogoSlot[] = ["collapsed", "favicon"];

export type LogoKey = `${LogoSlot}:${ThemeMode}`;

/** A logo picked and not saved yet; previewed as a `data:` URL. */
export interface PendingLogo {
  contentType: string;
  base64Content: string;
  /** The picked file's name, shown on its tile. */
  fileName: string;
}

export type PendingLogos = Partial<Record<LogoKey, PendingLogo>>;

export function logoKey(slot: LogoSlot, mode: ThemeMode): LogoKey {
  return `${slot}:${mode}`;
}

export function parseLogoKey(
  key: string,
): { slot: LogoSlot; mode: ThemeMode } | undefined {
  const [slot, mode] = key.split(":");
  const knownSlot = LOGO_SLOTS.find((entry) => entry === slot);
  const knownMode = THEME_MODES.find((entry) => entry === mode);
  return knownSlot && knownMode
    ? { slot: knownSlot, mode: knownMode }
    : undefined;
}

export function pendingEntries(
  pending: PendingLogos,
): [{ slot: LogoSlot; mode: ThemeMode }, PendingLogo][] {
  return Object.entries(pending).flatMap(([key, logo]) => {
    const parsed = parseLogoKey(key);
    return parsed && logo ? [[parsed, logo]] : [];
  });
}

export function logoDataUrl(logo: PendingLogo): string {
  return `data:${logo.contentType};base64,${logo.base64Content}`;
}

/** A copy of `logos` without one slot's mode, and without the slot once empty. */
export function withoutLogo(
  logos: ThemeLogos,
  slot: LogoSlot,
  mode: ThemeMode,
): ThemeLogos {
  const { [mode]: _dropped, ...rest } = logos[slot] ?? {};
  const { [slot]: _slot, ...others } = logos;
  return Object.keys(rest).length > 0 ? { ...others, [slot]: rest } : others;
}

/** The largest logo the module accepts. */
export const MAX_LOGO_BYTES = 512 * 1024;

/** The types the module accepts, by the extension they are picked by. */
const LOGO_TYPES_BY_EXTENSION: Record<string, readonly string[]> = {
  svg: ["image/svg+xml"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  ico: ["image/x-icon", "image/vnd.microsoft.icon"],
};

const ACCEPTED_TYPES = Object.values(LOGO_TYPES_BY_EXTENSION).flat();

export const LOGO_INPUT_ACCEPT = [
  ...new Set([
    ...ACCEPTED_TYPES,
    ...Object.keys(LOGO_TYPES_BY_EXTENSION).map((extension) => `.${extension}`),
  ]),
].join(",");

export type PickedFile = Pick<File, "name" | "type" | "size">;

/** The type a logo is sent as: the browser's, else the one its extension names. */
export function logoContentType(file: PickedFile): string | undefined {
  if (file.type !== "") {
    return ACCEPTED_TYPES.includes(file.type) ? file.type : undefined;
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return Object.hasOwn(LOGO_TYPES_BY_EXTENSION, extension)
    ? LOGO_TYPES_BY_EXTENSION[extension]?.[0]
    : undefined;
}

/** Why a file cannot be a logo, as an i18n key, before it is sent. */
export function logoRefusal(
  file: PickedFile,
):
  | "branding.logo.wrong_type"
  | "branding.logo.empty"
  | "branding.logo.too_large"
  | undefined {
  if (!logoContentType(file)) return "branding.logo.wrong_type";
  if (file.size === 0) return "branding.logo.empty";
  return file.size > MAX_LOGO_BYTES ? "branding.logo.too_large" : undefined;
}

type LogoSource = { pendingLogos: PendingLogos; draft: ThemeDraft };

/** The builder ends each logo file it writes with a hash of the content. */
const HASHED_NAME_SUFFIX = /-([0-9a-f]{8}\.[a-z]+)$/;

/** Whether two slots show the same logo in a mode: the same file picked, or saved files with the same hash. */
export function sameLogo(
  source: LogoSource,
  first: LogoSlot,
  second: LogoSlot,
  mode: ThemeMode,
): boolean {
  const pendingFirst = source.pendingLogos[logoKey(first, mode)];
  const pendingSecond = source.pendingLogos[logoKey(second, mode)];
  if (pendingFirst || pendingSecond) {
    return pendingFirst?.base64Content === pendingSecond?.base64Content;
  }
  const savedFirst = source.draft.logos[first]?.[mode];
  const savedSecond = source.draft.logos[second]?.[mode];
  if (savedFirst === savedSecond) return true;
  const hash = (path: string | undefined) =>
    path ? HASHED_NAME_SUFFIX.exec(path)?.[1] : undefined;
  return (
    hash(savedFirst) !== undefined && hash(savedFirst) === hash(savedSecond)
  );
}

/** Whether a slot holds a project logo in a mode, saved or picked. */
export function holdsLogo(
  source: LogoSource,
  slot: LogoSlot,
  mode: ThemeMode,
): boolean {
  return (
    source.pendingLogos[logoKey(slot, mode)] !== undefined ||
    source.draft.logos[slot]?.[mode] !== undefined
  );
}

/** Whether, in a mode, the square icon shows the same project logo as the wide one. */
export function iconFollowsLogo(source: LogoSource, mode: ThemeMode): boolean {
  return (
    holdsLogo(source, "default", mode) &&
    sameLogo(source, "default", "collapsed", mode)
  );
}

/**
 * The slots the simple mode's logo goes to in a mode: the wide ones, and the
 * square ones too unless they hold an icon of their own.
 */
export function simpleLogoSlots(
  source: LogoSource,
  mode: ThemeMode,
): LogoSlot[] {
  const hasOwnIcon =
    holdsLogo(source, "collapsed", mode) && !iconFollowsLogo(source, mode);
  return hasOwnIcon
    ? [...WIDE_LOGO_SLOTS]
    : [...WIDE_LOGO_SLOTS, ...SQUARE_LOGO_SLOTS];
}
