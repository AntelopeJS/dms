// The colours of the agenda: an event's tint, bar and text from its colour
// (a tone or any CSS colour), readable in light and dark mode, and the
// shading of a background (closed hatched, holiday tinted).

import type { AgendaBackground, AgendaColor } from "../../../types/full-agenda";
import type { Tone } from "../../../types/tone";
import type { AgendaPaint } from "./agendaModel";

const TONES: ReadonlySet<string> = new Set<Tone>([
  "neutral",
  "primary",
  "secondary",
  "success",
  "warning",
  "error",
  "info",
]);

/** A neutral tone has no `--ui-neutral` colour of its own: its accented border reads as one. */
const TONE_COLORS: Partial<Record<Tone, string>> = {
  neutral: "var(--ui-text-muted)",
};

export const DEFAULT_AGENDA_COLOR: AgendaColor = "primary";
const DEFAULT_HOLIDAY_COLOR: AgendaColor = "warning";
const DEFAULT_HIGHLIGHT_COLOR: AgendaColor = "info";
const TINT_PERCENT = 14;
const TEXT_PERCENT = 70;
const BACKGROUND_PERCENT = 10;
const HATCH_IMAGE =
  "repeating-linear-gradient(-45deg, var(--ui-border-accented) 0 1px, transparent 1px 7px)";

export function isAgendaTone(color: string): color is Tone {
  return TONES.has(color);
}

/** The colour forms a runtime without `CSS.supports` (a server render) takes on trust. */
const COLOR_FORMS =
  /^(#[\da-f]{3,8}|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(.+\))$/i;
const CUSTOM_PROPERTY = /^var\(--[\w-]+(,.*)?\)$/;

/** Whether a colour other than a tone is one CSS takes; a custom property is trusted. */
function isCssColor(value: string): boolean {
  if (CUSTOM_PROPERTY.test(value)) return true;
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function")
    return CSS.supports("color", value);
  return COLOR_FORMS.test(value);
}

/**
 * A colour as CSS: a tone (any case) as its `--ui-<tone>` variable, a CSS
 * colour or a custom property as written; anything else (a typo, an unknown
 * name) falls back to the primary tone, so the event keeps a tint and a bar.
 */
export function agendaColorCss(color: AgendaColor | undefined): string {
  const value = (color ?? DEFAULT_AGENDA_COLOR).trim();
  const tone = value.toLowerCase();
  if (isAgendaTone(tone)) return TONE_COLORS[tone] ?? `var(--ui-${tone})`;
  if (isCssColor(value)) return value;
  return agendaColorCss(DEFAULT_AGENDA_COLOR);
}

const paintCache = new Map<string, AgendaPaint>();

/**
 * How an event of `color` is painted: a light tint of it behind its text,
 * the colour itself on its edge (and as the fill of a `solid` event), and a
 * text mixed toward the theme's strongest text so it reads in both modes.
 */
export function agendaPaint(color: AgendaColor | undefined): AgendaPaint {
  const key = color ?? DEFAULT_AGENDA_COLOR;
  const cached = paintCache.get(key);
  if (cached) return cached;
  const css = agendaColorCss(key);
  const paint: AgendaPaint = {
    background: `color-mix(in oklab, ${css} ${TINT_PERCENT}%, var(--ui-bg))`,
    bar: css,
    text: `color-mix(in oklab, ${css} ${TEXT_PERCENT}%, var(--ui-text-highlighted))`,
    onBar: "var(--ui-text-inverted)",
  };
  paintCache.set(key, paint);
  return paint;
}

/**
 * The style shading a background: `closed` hatched (as a disabled Matrix
 * cell), `holiday` a tint of its colour (warning by default), `highlight` a
 * lighter tint (info by default). `hatched` adds the hatching to any kind.
 */
export function agendaBackgroundStyle(
  background: AgendaBackground,
): Record<string, string> {
  const kind = background.kind ?? "highlight";
  const isHatched = background.hatched ?? kind === "closed";
  const color =
    background.color ??
    (kind === "holiday" ? DEFAULT_HOLIDAY_COLOR : DEFAULT_HIGHLIGHT_COLOR);
  const tint =
    kind === "closed" && !background.color
      ? undefined
      : `color-mix(in oklab, ${agendaColorCss(color)} ${BACKGROUND_PERCENT}%, transparent)`;
  const layers = [
    isHatched ? HATCH_IMAGE : "",
    tint ? `linear-gradient(${tint}, ${tint})` : "",
  ].filter(Boolean);
  return layers.length ? { backgroundImage: layers.join(", ") } : {};
}
