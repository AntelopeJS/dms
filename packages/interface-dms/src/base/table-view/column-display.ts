import {
  type Class,
  type ClassDecorator,
  MakeClassDecorator,
} from "@antelopejs/interface-core/decorators";
import type { BlockText } from "../types/composed-text";
import type { Tone } from "../types/tone";
import { displayIds } from "./internal/column-display";

/**
 * How table cells (and expanded-row fields) draw a column's value, in place of
 * its data type's own rendering. The column keeps its `type` for its forms,
 * filters, validation and exports.
 *
 * A display is a class registered under an id with {@link RegisterDisplay},
 * matching a data type registered on the frontend (`registerDataType`) that
 * draws the cell; its options are typed by the class. A module registers its
 * own displays the same way, under `<module>:<id>`.
 *
 * @example
 * ```ts
 * @RegisterDisplay("automation:duration")
 * export class DurationDisplay extends ColumnDisplay<{ unit?: "s" | "ms" }> {}
 * ```
 */
export abstract class ColumnDisplay<
  Options extends object = Record<string, unknown>,
> {
  // Nominal: a plain `{ options }` object is no display, it has no id.
  protected readonly isColumnDisplay = true;

  constructor(public readonly options?: Options) {}
}

/** A column display as it reaches the client: its id and options. */
export interface ColumnDisplaySerialized {
  /** Id of the frontend data type drawing the cells. */
  type: string;
  options?: Record<string, unknown>;
}

/**
 * Register a column display class under the id of the frontend data type that
 * draws its cells. A module's display id is `<module>:<id>`.
 * @param id - Id of the frontend data type
 * @returns The display class decorator
 */
export const RegisterDisplay: (
  id: string,
) => ClassDecorator<Class<ColumnDisplay<object>>> = MakeClassDecorator(
  (target, id: string) => {
    displayIds.set(target, id);
  },
);

/** The tones of a cell's text. */
export type CellTone =
  | "default"
  | "muted"
  | "dimmed"
  | "highlighted"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "primary";

/**
 * A cell's secondary line as a row field holds it, with the tone that row
 * gives it: "Payment failed · retry Oct 10" in `error`, "Due Oct 28" in
 * `muted`. The server picks the text and the tone per row; the column only
 * names the field.
 *
 * @example
 * ```ts
 * @Listable(["status", "attemptCount", "nextPaymentAttemptAt"])
 * get statusDetail(): CellSubline | null {
 *   if (this.status !== "open" || !this.nextPaymentAttemptAt) return null;
 *   const date = this.nextPaymentAttemptAt.toISOString();
 *   return {
 *     text: {
 *       key: "$saas.invoice.sub_state.retry",
 *       params: { date: { type: "date", value: date, format: "day" } },
 *     },
 *     tone: "error",
 *   };
 * }
 * ```
 */
export interface CellSubline {
  /** The line: a string (`$`-prefixed for an i18n key) or a composed text. */
  text: BlockText;
  /** Tone of the line; the display's own tone when left out. */
  tone?: CellTone;
}

/**
 * What a row field drawn as a cell's secondary line holds: a text, or a text
 * and its tone. Nothing (`null`, `""`) draws no line.
 */
export type CellSublineValue = BlockText | CellSubline;

export namespace DefaultDisplays {
  /** A badge an identity cell shows when a field of the row matches. */
  export interface IdentityBadge {
    /** Field of the row the badge reads. */
    field: string;
    /** Shown when the field equals this; `true` when neither is given. */
    equals?: unknown;
    /** Shown when the field differs from this. */
    notEquals?: unknown;
    /** `$`-prefixed: an i18n key. */
    label: string;
    /** Tone of the badge's pill. */
    tone?: Tone;
  }

  export interface IdentityDisplayOptions {
    /** Row field holding the avatar (an image value or a URL). */
    avatarField?: string;
    /** Icon drawn in a tile instead of an avatar. */
    icon?: string;
    /**
     * Row field drawn as the secondary line: a string, drawn as written (an
     * address, an id), or a `ComposedText` or {@link CellSubline}
     * composed in the reader's language.
     */
    subtitleField?: string;
    /** Tone of the secondary line when the row gives none. Defaults to `dimmed`. */
    subtitleTone?: CellTone;
    /** Row field holding the user id that marks the signed-in user's row. */
    selfField?: string;
    /** Tag of the signed-in user's row ("You"). `$`-prefixed: an i18n key. */
    selfLabel?: string;
    badges?: IdentityBadge[];
    /** File storage the avatar is read from. */
    storage?: string;
    /**
     * Name drawn, muted, for a row without a value ("Automatic" for a credit
     * note no operator issued). `$`-prefixed: an i18n key.
     */
    emptyLabel?: string;
    /** Icon drawn in a tile for a row without a value (`i-ph-robot`). */
    emptyIcon?: string;
  }

  /**
   * Avatar or icon tile, the value as the name, a "You" tag on the signed-in
   * user's row, badges and a secondary line, all read off the row; an empty
   * label and icon for a row without a value.
   */
  @RegisterDisplay("identity")
  export class IdentityDisplay extends ColumnDisplay<IdentityDisplayOptions> {}

  /** The single filled pill drawn in place of the list. */
  export interface ExclusivePill {
    /** Row field that, when set, replaces the list with this pill. */
    field: string;
    /** `$`-prefixed: an i18n key. */
    label: string;
    icon?: string;
  }

  /**
   * How a pill item is drawn: `soft` a tinted pill, `outline` a hairline one
   * in its tone.
   */
  export type PillVariant = "soft" | "outline";

  /**
   * A pill the server styles per row, an item of the list a `PillsDisplay`
   * draws (a locale present in solid, a missing one outlined). A list may mix
   * them with plain strings.
   *
   * @example
   * ```ts
   * @Listable(["translations"])
   * get locales(): Array<string | DefaultDisplays.PillItem> {
   *   return LOCALES.map((locale) =>
   *     this.translations[locale]
   *       ? { label: locale, tone: "success", variant: "soft" }
   *       : { label: locale, variant: "outline" },
   *   );
   * }
   * ```
   */
  export interface PillItem {
    /** `$`-prefixed for an i18n key. */
    label: string;
    /** Tone of the pill. Defaults to `neutral`. */
    tone?: Tone;
    /**
     * `soft` by default. An item with neither a tone nor a variant is drawn
     * as a plain string is.
     */
    variant?: PillVariant;
  }

  export interface PillsDisplayOptions {
    /** Field naming a related row (relation values). Defaults to `name`. */
    labelKey?: string;
    /** One filled pill drawn when the row's field is set (an owner's crown). */
    exclusive?: ExclusivePill;
    /** Text drawn for an empty list. `$`-prefixed: an i18n key. */
    emptyLabel?: string;
  }

  /**
   * A list (relation rows, select values, strings, {@link PillItem}s) as
   * outline pills, a pill item in its own tone and variant; a bare id a
   * relation could not resolve is skipped.
   */
  @RegisterDisplay("pills")
  export class PillsDisplay extends ColumnDisplay<PillsDisplayOptions> {}

  /** How a relative date reads: "2 hr. ago" or "Sep 27". */
  export type RelativeDateStyle = "relative" | "day";

  export interface RelativeDateDisplayOptions {
    /** `relative` ("2 hr. ago", "In 5 days", the default) or `day`. */
    style?: RelativeDateStyle;
    tone?: CellTone;
    /** A past date closer than this reads `nowLabel`, with a live dot. */
    nowWithinMs?: number;
    nowLabel?: string;
    /** Text and tone of a missing date. */
    emptyLabel?: string;
    emptyTone?: CellTone;
    /** A future date closer than this takes `soonTone` (warning). */
    soonWithinMs?: number;
    soonTone?: CellTone;
    /** Style and tone of a date already past (an expired invitation). */
    pastStyle?: RelativeDateStyle;
    pastTone?: CellTone;
    /** Row field naming who acted: "Sep 27 · by Camille". */
    byField?: string;
    /** i18n key receiving `{ date, name }`. */
    byLabel?: string;
  }

  /**
   * A date as the distance to now, with an "active now" window, a "soon"
   * tone, a dimmed past and an optional "· by" author.
   */
  @RegisterDisplay("relative_date")
  export class RelativeDateDisplay extends ColumnDisplay<RelativeDateDisplayOptions> {}

  export interface IndicatorDisplayOptions {
    onLabel?: string;
    offLabel?: string;
    onIcon?: string;
    offIcon?: string;
    /** Defaults to `success`. */
    onTone?: CellTone;
    /** Defaults to `dimmed`. */
    offTone?: CellTone;
  }

  /** An on/off state as an icon and a word: on for a set flag or a list. */
  @RegisterDisplay("indicator")
  export class IndicatorDisplay extends ColumnDisplay<IndicatorDisplayOptions> {}

  export interface StatusPillDisplayOptions {
    /**
     * Tone of the pill for each value of the column; a value left out is
     * neutral. A select column's item labels and icons name the pill.
     * @example { healthy: "success", degraded: "warning", failing: "error" }
     */
    tones?: Record<string, Tone>;
    /**
     * Row field holding the pill's tone, a `Tone` the server picks per row (an
     * HTTP status by its class); read before `tones`. A row whose field holds
     * no tone falls back to `tones`.
     */
    toneField?: string;
    /**
     * Row field drawn under the pill (the failure's cause): a string
     * (`$`-prefixed for an i18n key), a `ComposedText` or a
     * {@link CellSubline} carrying its own tone.
     */
    subField?: string;
    /** Tone of the line under the pill when the row gives none; the pill's by default. */
    subTone?: CellTone;
    /** A pulsing dot for these values (a run in progress). */
    liveValues?: string[];
  }

  /** A status as a tinted pill led by a dot, with an optional line under it. */
  @RegisterDisplay("status_pill")
  export class StatusPillDisplay extends ColumnDisplay<StatusPillDisplayOptions> {}

  export interface TwoLineDisplayOptions {
    /**
     * Row field holding the primary line, a string (`$`-prefixed for an i18n
     * key) or a `ComposedText`, drawn in place of the column's value
     * ("Renews in 3 days" over a `renewsAt` date column). Without it the
     * primary line is the column's value, written by the column's own data
     * type (an amount, a date, a select's label) or composed when the value
     * is a `ComposedText`.
     */
    primaryField?: string;
    /** Row field holding the secondary line: a {@link CellSublineValue}. */
    subField?: string;
    /** Tone of the secondary line when the row gives none. Defaults to `muted`. */
    subTone?: CellTone;
    /** Text drawn for an empty primary line. `$`-prefixed: an i18n key. Defaults to "—". */
    emptyLabel?: string;
  }

  /**
   * A primary line over a secondary one, without an avatar: a plan over its
   * price per seat, an amount over what it means, a reason over its memo.
   */
  @RegisterDisplay("two_line")
  export class TwoLineDisplay extends ColumnDisplay<TwoLineDisplayOptions> {}

  export interface ProgressDisplayOptions {
    /** Row field holding the number of items done. */
    doneField: string;
    /** Row field holding the number of items in all. */
    totalField: string;
    /** Row field holding the number of failed items, drawn in red. */
    errorField?: string;
  }

  /**
   * A bar filled with the share of items done ("31 / 44"), failed items in
   * red at its end; green once every item is done.
   */
  @RegisterDisplay("progress")
  export class ProgressDisplay extends ColumnDisplay<ProgressDisplayOptions> {}

  export interface SparklineDisplayOptions {
    /** Row field holding the series, a list of numbers. */
    field: string;
    /** Line color. Defaults to `primary`. */
    tone?: Tone;
  }

  /** A small line chart of a list of numbers ("last 30 days"). */
  @RegisterDisplay("sparkline")
  export class SparklineDisplay extends ColumnDisplay<SparklineDisplayOptions> {}

  /** The unit a duration column stores. */
  export type DurationUnit = "ms" | "s";

  export interface DurationDisplayOptions {
    /** Unit of the stored number. Defaults to `ms`. */
    unit?: DurationUnit;
  }

  /** A duration in its most readable unit: "910 ms", "1.8 s", "4 min 12 s". */
  @RegisterDisplay("duration")
  export class DurationDisplay extends ColumnDisplay<DurationDisplayOptions> {}

  /** A size in bytes in its most readable unit: "12 kB", "1.4 MB". */
  @RegisterDisplay("bytes")
  export class BytesDisplay extends ColumnDisplay<Record<string, never>> {}

  export interface MonoDisplayOptions {
    /** A button copies the value (an id, a key, a URL). */
    copy?: boolean;
  }

  /** The value in a monospace font: ids, codes, slugs. */
  @RegisterDisplay("mono")
  export class MonoDisplay extends ColumnDisplay<MonoDisplayOptions> {}
}
