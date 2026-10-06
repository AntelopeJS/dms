import { Logging } from "@antelopejs/interface-core/logging";

/**
 * The semantic tones of the dashboard, the colour names of Nuxt UI. A clickable
 * thing (a button, a row action, a tab) takes one as its `color`; a thing that
 * shows a state (a pill, an icon well, a banner, a meter, a notification) as its
 * `tone`. A block that supports fewer narrows the union with `Extract<>`.
 */
export const TONES = [
  "neutral",
  "primary",
  "secondary",
  "success",
  "warning",
  "error",
  "info",
] as const;

export type Tone = (typeof TONES)[number];

/**
 * The tones of an icon well: the semantic ones plus `muted`, the quiet well
 * of a settings row or a status strip cell.
 */
export const ICON_TONES = [...TONES, "muted"] as const;

export type IconTone = (typeof ICON_TONES)[number];

/**
 * Former tone names still read in 0.4, with a warning: `accent` is `primary`,
 * `ok` is `success`. They go in 0.5.
 *
 * @internal
 */
export const DEPRECATED_TONE_ALIASES = {
  accent: "primary",
  ok: "success",
} as const satisfies Record<string, Tone>;

/** @internal */
export type DeprecatedToneAlias = keyof typeof DEPRECATED_TONE_ALIASES;

const warnedAliases = new Set<string>();

function isDeprecatedToneAlias(value: unknown): value is DeprecatedToneAlias {
  return (
    typeof value === "string" && Object.hasOwn(DEPRECATED_TONE_ALIASES, value)
  );
}

/**
 * `value` with a deprecated tone name replaced by the current one, and a
 * warning logged once per name; any other value is returned as is.
 *
 * @internal
 */
export function resolveToneAlias<T>(value: T): T {
  if (!isDeprecatedToneAlias(value)) return value;
  const tone = DEPRECATED_TONE_ALIASES[value];
  if (!warnedAliases.has(value)) {
    warnedAliases.add(value);
    Logging.Warn(
      `[DMS] Tone "${value}" is deprecated and goes in 0.5; use "${tone}".`,
    );
  }
  return tone as T;
}

/**
 * `items` with the `key` tone of each entry passed through
 * {@link resolveToneAlias}.
 *
 * @internal
 */
export function resolveItemToneAliases<T extends object>(
  items: T[] | undefined,
  ...keys: Array<keyof T>
): T[] | undefined {
  return items?.map((item) =>
    keys.reduce(
      (resolved, key) =>
        resolved[key] === undefined
          ? resolved
          : { ...resolved, [key]: resolveToneAlias(resolved[key]) },
      item,
    ),
  );
}
