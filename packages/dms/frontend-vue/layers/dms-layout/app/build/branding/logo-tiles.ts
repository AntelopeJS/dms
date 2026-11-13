import {
  holdsLogo,
  iconFollowsLogo,
  logoKey,
  sameLogo,
  simpleLogoSlots,
  SQUARE_LOGO_SLOTS,
} from "./logos";
import type { LogoPlacement, ThemeEdit } from "./model";
import { THEME_MODES, type LogoSlot, type ThemeMode } from "./theme-types";

export type LogoTarget = Omit<LogoPlacement, "logo">;

/** The name a tile shows for what a slot holds: the picked file, else the saved file; undefined for the DMS's. */
export function slotFileName(
  edit: ThemeEdit,
  slot: LogoSlot,
  mode: ThemeMode,
): string | undefined {
  const pending = edit.pendingLogos[logoKey(slot, mode)];
  if (pending) return pending.fileName;
  return edit.draft.logos[slot]?.[mode]?.split("/").pop();
}

export type SimpleTileId = "light" | "dark" | "favicon" | "email";

export interface SimpleTile {
  id: SimpleTileId;
  icon: string;
  /** Where a file picked on the tile goes, and what its remove clears. */
  targets: LogoTarget[];
  fileName: string | undefined;
}

const across = (slots: readonly LogoSlot[], modes: readonly ThemeMode[]) =>
  modes.flatMap((mode) => slots.map((slot) => ({ slot, mode })));

/**
 * The simple mode's four tiles. A wide logo per mode fills the logo and the
 * email, and the square slots unless the favicon tile set an icon of its own;
 * the email tile sets an email logo apart from the wide one.
 */
export function simpleTiles(edit: ThemeEdit): SimpleTile[] {
  const wide = (mode: ThemeMode): SimpleTile => ({
    id: mode,
    icon: mode === "light" ? "i-ph-sun-light" : "i-ph-moon-light",
    targets: across(simpleLogoSlots(edit, mode), [mode]),
    fileName: slotFileName(edit, "default", mode),
  });
  const ownIcon = THEME_MODES.some(
    (mode) =>
      holdsLogo(edit, "collapsed", mode) && !iconFollowsLogo(edit, mode),
  );
  const ownEmail =
    holdsLogo(edit, "email", "light") &&
    !sameLogo(edit, "default", "email", "light");
  return [
    wide("light"),
    wide("dark"),
    {
      id: "favicon",
      icon: "i-ph-square-light",
      targets: across(SQUARE_LOGO_SLOTS, THEME_MODES),
      fileName: ownIcon ? slotFileName(edit, "favicon", "light") : undefined,
    },
    {
      id: "email",
      icon: "i-ph-envelope-simple-light",
      targets: across(["email"], THEME_MODES),
      fileName: ownEmail ? slotFileName(edit, "email", "light") : undefined,
    },
  ];
}
