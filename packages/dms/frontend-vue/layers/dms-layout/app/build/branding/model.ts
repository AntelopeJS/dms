import {
  CARD_RADIUS_VARIABLE,
  CORNER_PRESETS,
  FONT_VARIABLE,
  RADIUS_VARIABLE,
  STATUS_ROLES,
  type CornerPreset,
} from "./catalog";
import {
  LOGO_SLOTS,
  logoKey,
  pendingEntries,
  withoutLogo,
  type LogoKey,
  type PendingLogo,
  type PendingLogos,
} from "./logos";
import type {
  ThemeRefusal,
  LogoSlot,
  SetThemeDraft,
  ThemeColorRole,
  ThemeDraft,
  ThemeLayer,
  ThemeLogos,
  ThemeMode,
  ThemeStructure,
  ThemeVariableSetName,
  ThemeVariableSets,
} from "./theme-types";
import { THEME_MODES, VARIABLE_SET_NAMES } from "./theme-types";

/** The theme files as `GetTheme` last read them. */
export interface SavedTheme {
  theme: ThemeDraft;
  version: string;
}

/** An open edit: the saved theme, the whole theme as Save would write it, and the logos picked for it. */
export interface ThemeEdit {
  saved: SavedTheme;
  draft: ThemeDraft;
  pendingLogos: PendingLogos;
}

export type BrandingLoad =
  | { status: "loading" }
  | { status: "no-layer"; ref: string; created: ThemeLayer | null }
  | { status: "refused"; error: ThemeRefusal }
  | ({ status: "ready" } & ThemeEdit);

export type EditorMode = "simple" | "developer";

export function emptyTheme(): ThemeDraft {
  return {
    variables: { shared: {}, light: {}, dark: {} },
    colors: {},
    logos: {},
  };
}

export function cloneTheme(theme: ThemeDraft): ThemeDraft {
  return structuredClone({
    variables: theme.variables,
    colors: theme.colors,
    logos: theme.logos,
  });
}

export function savedThemeOf(structure: ThemeStructure): SavedTheme {
  return { theme: cloneTheme(structure), version: structure.version };
}

export function editOf(saved: SavedTheme): ThemeEdit {
  return { saved, draft: cloneTheme(saved.theme), pendingLogos: {} };
}

type Values = Partial<Record<string, string>>;

function differingKeys(next: Values, saved: Values): string[] {
  return [...new Set([...Object.keys(next), ...Object.keys(saved)])].filter(
    (key) => next[key] !== saved[key],
  );
}

function logoSlotsOf(...themes: ThemeDraft[]): LogoSlot[] {
  const named = themes.flatMap((theme) =>
    LOGO_SLOTS.filter((slot) => theme.logos[slot] !== undefined),
  );
  return [...new Set([...LOGO_SLOTS, ...named])];
}

/**
 * The changes the bar counts: each value set, changed or removed, per set;
 * each palette; each logo slot per mode, picked, reset or repointed.
 */
export function changeCount(edit: ThemeEdit): number {
  const { draft } = edit;
  const saved = edit.saved.theme;
  const variables = VARIABLE_SET_NAMES.reduce(
    (count, set) =>
      count + differingKeys(draft.variables[set], saved.variables[set]).length,
    0,
  );
  const colors = differingKeys(draft.colors, saved.colors).length;
  const logos = logoSlotsOf(draft, saved).reduce(
    (count, slot) =>
      count +
      THEME_MODES.filter(
        (mode) =>
          edit.pendingLogos[logoKey(slot, mode)] !== undefined ||
          draft.logos[slot]?.[mode] !== saved.logos[slot]?.[mode],
      ).length,
    0,
  );
  return variables + colors + logos;
}

/** Each key the draft changed from `from`, set or removed, applied on top of `onto`. */
function rebaseValues(
  draft: Values,
  from: Values,
  onto: Values,
): Map<string, string> {
  const result = new Map(
    Object.entries(onto).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value]],
    ),
  );
  for (const key of differingKeys(draft, from)) {
    const value = draft[key];
    if (value === undefined) result.delete(key);
    else result.set(key, value);
  }
  return result;
}

function pick<Key extends string>(
  values: Map<string, string>,
  keys: readonly Key[],
): Partial<Record<Key, string>> {
  const picked: Partial<Record<Key, string>> = {};
  for (const key of keys) {
    const value = values.get(key);
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}

const COLOR_ROLES: readonly ThemeColorRole[] = ["primary", ...STATUS_ROLES];

/** Three-way merge: the draft's changes from `from`, moved onto `onto`. */
export function rebaseTheme(
  draft: ThemeDraft,
  from: ThemeDraft,
  onto: ThemeDraft,
): ThemeDraft {
  const logos: ThemeLogos = {};
  for (const slot of logoSlotsOf(draft, from, onto)) {
    const paths = rebaseValues(
      draft.logos[slot] ?? {},
      from.logos[slot] ?? {},
      onto.logos[slot] ?? {},
    );
    if (paths.size > 0) logos[slot] = pick(paths, THEME_MODES);
  }
  const variables: ThemeVariableSets = { shared: {}, light: {}, dark: {} };
  for (const set of VARIABLE_SET_NAMES) {
    variables[set] = Object.fromEntries(
      rebaseValues(
        draft.variables[set],
        from.variables[set],
        onto.variables[set],
      ),
    );
  }
  return {
    variables,
    colors: pick(
      rebaseValues(draft.colors, from.colors, onto.colors),
      COLOR_ROLES,
    ),
    logos,
  };
}

/** The edit moved onto newer files: what it changed stays on top, the rest follows the files. */
export function rebaseEdit(edit: ThemeEdit, onto: SavedTheme): ThemeEdit {
  return {
    saved: onto,
    draft: rebaseTheme(edit.draft, edit.saved.theme, onto.theme),
    pendingLogos: edit.pendingLogos,
  };
}

/**
 * The edit once the files hold what `sent` saved: changes made while the save
 * was in flight stay on top, and the logos it sent stop being pending.
 */
export function settleSave(
  current: ThemeEdit,
  sent: ThemeEdit,
  onDisk: SavedTheme,
): ThemeEdit {
  let draft = rebaseTheme(current.draft, sent.draft, onDisk.theme);
  const pendingLogos: PendingLogos = {};
  for (const [{ slot, mode }, logo] of pendingEntries(current.pendingLogos)) {
    const key = logoKey(slot, mode);
    if (sent.pendingLogos[key]?.base64Content !== logo.base64Content) {
      pendingLogos[key] = logo;
    }
  }
  for (const [{ slot, mode }] of pendingEntries(sent.pendingLogos)) {
    const removedSince =
      current.pendingLogos[logoKey(slot, mode)] === undefined &&
      current.draft.logos[slot]?.[mode] === undefined;
    if (removedSince)
      draft = { ...draft, logos: withoutLogo(draft.logos, slot, mode) };
  }
  return { saved: onDisk, draft, pendingLogos };
}

function trimmed(variables: ThemeVariableSets): ThemeVariableSets {
  const trim = (values: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, value.trim()]),
    );
  return {
    shared: trim(variables.shared),
    light: trim(variables.light),
    dark: trim(variables.dark),
  };
}

/** The body of `SetTheme`: the whole draft, values trimmed, with the picked logos as uploads. */
export function toSetThemeDraft(edit: ThemeEdit): SetThemeDraft {
  return {
    variables: trimmed(edit.draft.variables),
    colors: { ...edit.draft.colors },
    logos: structuredClone(edit.draft.logos),
    uploads: pendingEntries(edit.pendingLogos).map(
      ([{ slot, mode }, logo]) => ({
        slot,
        mode,
        contentType: logo.contentType,
        base64Content: logo.base64Content,
      }),
    ),
  };
}

/** No override left: every color, variable and logo back to the DMS default. */
export function resetToDms(edit: ThemeEdit): ThemeEdit {
  return { saved: edit.saved, draft: emptyTheme(), pendingLogos: {} };
}

export function discardEdit(edit: ThemeEdit): ThemeEdit {
  return editOf(edit.saved);
}

function withDraft(edit: ThemeEdit, draft: ThemeDraft): ThemeEdit {
  return { ...edit, draft };
}

/** A value set as typed; an empty one is removed, so the DMS default applies. */
export function setVariable(
  edit: ThemeEdit,
  set: ThemeVariableSetName,
  name: string,
  value: string,
): ThemeEdit {
  const { [name]: _previous, ...others } = edit.draft.variables[set];
  const values = value.trim() === "" ? others : { ...others, [name]: value };
  return withDraft(edit, {
    ...edit.draft,
    variables: { ...edit.draft.variables, [set]: values },
  });
}

/** A value removed from every set. */
export function resetVariable(edit: ThemeEdit, name: string): ThemeEdit {
  return VARIABLE_SET_NAMES.reduce(
    (next, set) => setVariable(next, set, name, ""),
    edit,
  );
}

export function setColor(
  edit: ThemeEdit,
  role: ThemeColorRole,
  palette: string | undefined,
): ThemeEdit {
  const { [role]: _previous, ...others } = edit.draft.colors;
  const colors = palette ? { ...others, [role]: palette } : others;
  return withDraft(edit, { ...edit.draft, colors });
}

/** The controls' and the cards' radius together; `null` puts back the DMS's. */
export function setCorners(
  edit: ThemeEdit,
  preset: CornerPreset | null,
): ThemeEdit {
  const radius = setVariable(
    edit,
    "shared",
    RADIUS_VARIABLE,
    preset?.radius ?? "",
  );
  return setVariable(
    radius,
    "shared",
    CARD_RADIUS_VARIABLE,
    preset?.cardRadius ?? "",
  );
}

/** The preset the draft's corners match, if any. */
export function activeCorners(draft: ThemeDraft): CornerPreset | undefined {
  const values = draft.variables.shared;
  return CORNER_PRESETS.find(
    (preset) =>
      values[RADIUS_VARIABLE] === preset.radius &&
      values[CARD_RADIUS_VARIABLE] === preset.cardRadius,
  );
}

export function setFont(edit: ThemeEdit, stack: string | undefined): ThemeEdit {
  return setVariable(edit, "shared", FONT_VARIABLE, stack ?? "");
}

export interface LogoPlacement {
  slot: LogoSlot;
  mode: ThemeMode;
  logo: PendingLogo;
}

/** Logos picked for slots: each replaces the slot's saved path until saved. */
export function placeLogos(
  edit: ThemeEdit,
  placements: LogoPlacement[],
): ThemeEdit {
  let logos = edit.draft.logos;
  const pendingLogos: PendingLogos = { ...edit.pendingLogos };
  for (const { slot, mode, logo } of placements) {
    logos = withoutLogo(logos, slot, mode);
    pendingLogos[logoKey(slot, mode)] = logo;
  }
  return { ...edit, draft: { ...edit.draft, logos }, pendingLogos };
}

/** Slots back to the DMS logo in a mode: no file picked, no path. */
export function removeLogos(
  edit: ThemeEdit,
  slots: readonly LogoSlot[],
  mode: ThemeMode,
): ThemeEdit {
  let logos = edit.draft.logos;
  const pendingLogos: PendingLogos = { ...edit.pendingLogos };
  for (const slot of slots) {
    logos = withoutLogo(logos, slot, mode);
    delete pendingLogos[logoKey(slot, mode)];
  }
  return { ...edit, draft: { ...edit.draft, logos }, pendingLogos };
}

/** What a slot shows in a mode, for a tile or the preview. */
export type LogoView =
  | { kind: "pending"; key: LogoKey; logo: PendingLogo }
  | { kind: "saved"; path: string }
  | { kind: "dms"; path: string | undefined };

export function logoView(
  edit: ThemeEdit,
  slot: LogoSlot,
  mode: ThemeMode,
  dmsLogos: Partial<Record<LogoSlot, Partial<Record<ThemeMode, string>>>>,
): LogoView {
  const key = logoKey(slot, mode);
  const pending = edit.pendingLogos[key];
  if (pending) return { kind: "pending", key, logo: pending };
  const path = edit.draft.logos[slot]?.[mode];
  return path
    ? { kind: "saved", path }
    : { kind: "dms", path: dmsLogos[slot]?.[mode] };
}
