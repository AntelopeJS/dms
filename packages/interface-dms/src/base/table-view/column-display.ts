import {
  type Class,
  type ClassDecorator,
  MakeClassDecorator,
} from "@antelopejs/interface-core/decorators";
import type { DisplayTone } from "../display";

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

// Weak: a hot reload registers a module's displays again as new classes, and
// the replaced ones must not stay reachable through this lookup.
const displayIds = new WeakMap<Class<ColumnDisplay<object>>, string>();

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

/** The id a display instance is registered under, if any. */
export function getColumnDisplayId(
  display: ColumnDisplay<object>,
): string | undefined {
  return displayIds.get(Object.getPrototypeOf(display).constructor);
}

/**
 * A column display as the column metadata carries it. Throws for a display
 * whose class was never registered: its cells would fall back to the column's
 * type without a word.
 */
export function serializeColumnDisplay(
  display: ColumnDisplay<object> | undefined,
): ColumnDisplaySerialized | undefined {
  if (!display) return undefined;
  const type = getColumnDisplayId(display);
  if (!type) {
    throw new Error(
      `Column display ${Object.getPrototypeOf(display).constructor.name} is not registered: decorate its class with @RegisterDisplay("<module>:<id>")`,
    );
  }
  const { options } = display;
  return options
    ? { type, options: options as Record<string, unknown> }
    : { type };
}

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
    color?: DisplayTone;
  }

  export interface IdentityDisplayOptions {
    /** Row field holding the avatar (an image value or a URL). */
    avatarField?: string;
    /** Icon drawn in a tile instead of an avatar. */
    icon?: string;
    /** Row field drawn as the secondary line. */
    subtitleField?: string;
    /** Row field holding the user id that marks the signed-in user's row. */
    selfField?: string;
    /** Tag of the signed-in user's row ("You"). `$`-prefixed: an i18n key. */
    selfLabel?: string;
    badges?: IdentityBadge[];
    /** File storage the avatar is read from. */
    storage?: string;
  }

  /**
   * Avatar or icon tile, the value as the name, a "You" tag on the signed-in
   * user's row, badges and a secondary line, all read off the row.
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

  export interface PillsDisplayOptions {
    /** Field naming a related row (relation values). Defaults to `name`. */
    labelKey?: string;
    /** One filled pill drawn when the row's field is set (an owner's crown). */
    exclusive?: ExclusivePill;
    /** Text drawn for an empty list. `$`-prefixed: an i18n key. */
    emptyLabel?: string;
  }

  /**
   * A list (relation rows, select values, strings) as outline pills; a bare
   * id a relation could not resolve is skipped.
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
}
