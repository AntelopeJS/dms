import type { CSSProperties } from "vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import type {
  TableViewCardProps,
  TableViewDisplayContext,
} from "../../../../composables/table-view/types/display";
import type { TableViewColumn } from "../../../../composables/table-view/types/column";

const FALLBACK_CARD_FIELD_COUNT = 4;

/** What a card shows already, so its fields leave it out. */
export interface CardShownKeys {
  /** The card's title. */
  labelKey?: string;
  rowIdKey: string;
  /** Shown another way: the column a kanban card sits in. */
  others?: string[];
}

/** The id of a row, read with the table's `rowIdKey`. */
export function cardRowId<T>(item: T, rowIdKey: string): string {
  return String(get(item as Record<string, unknown>, rowIdKey) ?? "");
}

/**
 * The props a custom card receives for `item`, the same whichever display
 * draws it.
 */
export function buildCardProps<T>(
  item: T,
  context: Pick<
    TableViewDisplayContext<T>,
    "columns" | "labelKey" | "rowIdKey" | "actions" | "selection"
  >,
): TableViewCardProps<T> {
  const rowId = cardRowId(item, context.rowIdKey);
  return {
    row: item,
    rowId,
    columns: context.columns,
    labelKey: context.labelKey,
    actions: context.actions,
    selected: context.selection.isSelected(rowId),
    select: (value?: boolean) => context.selection.toggle(rowId, value),
    open: () => context.actions.open(item),
  };
}

/**
 * The columns a card shows below its title, on the cards grid and the kanban
 * board alike: the declared `card.fields`, else the first listable columns
 * besides what the card shows already.
 */
export function cardFieldColumns(
  columns: TableViewColumn[],
  declared: string[] | undefined,
  shown: CardShownKeys,
): TableViewColumn[] {
  if (declared) {
    return declared
      .map((key) => columns.find((column) => column.accessorKey === key))
      .filter((column): column is TableViewColumn => !!column);
  }
  const skipped = new Set([
    shown.labelKey,
    shown.rowIdKey,
    ...(shown.others ?? []),
  ]);
  return columns
    .filter(
      (column) => column.listable !== false && !skipped.has(column.accessorKey),
    )
    .slice(0, FALLBACK_CARD_FIELD_COUNT);
}

/** The id of the data type drawing a name with its avatar and subtitle. */
const IDENTITY_DISPLAY_TYPE = "identity";

/** The database id: a technical key, never worth a line on a card. */
const DATABASE_ID_KEY = "_id";

/**
 * What a built-in card reads off its row besides its title: the subtitle and
 * the avatar the title column's `identity` display declares, so a card shows
 * the row as its grid cell does.
 */
export interface CardIdentity {
  /** Row field drawn under the title. */
  subtitleField?: string;
  /** Row field holding the avatar: an image value or a URL. */
  avatarField?: string;
  /** File storage the avatar is read from. */
  storage?: string;
}

const optionString = (
  options: Record<string, unknown> | undefined,
  key: string,
): string | undefined =>
  typeof options?.[key] === "string" ? options[key] : undefined;

/** The identity the title column (`labelKey`) declares, if it is one. */
export function cardIdentity(
  columns: TableViewColumn[],
  labelKey: string | undefined,
): CardIdentity {
  if (!labelKey) return {};
  const display = columns.find(
    (column) => column.accessorKey === labelKey,
  )?.display;
  if (display?.type !== IDENTITY_DISPLAY_TYPE) return {};
  return {
    subtitleField: optionString(display.options, "subtitleField"),
    avatarField: optionString(display.options, "avatarField"),
    storage: optionString(display.options, "storage"),
  };
}

const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== "";

/**
 * The line a card draws under its title, as the row holds it: the identity's
 * subtitle, else the row's id when the table names it with a key of its own
 * (`rowIdKey: "code"`) and the title is not it already. The database `_id`
 * is never shown: a UUID or `proj-074` tells the reader nothing.
 */
export function cardSubtitle<T>(
  item: T,
  identity: CardIdentity,
  shown: CardShownKeys,
): unknown {
  const row = item as Record<string, unknown>;
  if (identity.subtitleField) {
    const subtitle: unknown = get(row, identity.subtitleField);
    if (hasValue(subtitle)) return subtitle;
  }
  if (shown.rowIdKey === DATABASE_ID_KEY) return undefined;
  if (!shown.labelKey || !hasValue(get(row, shown.labelKey))) return undefined;
  const id = cardRowId(item, shown.rowIdKey);
  return id || undefined;
}

/** The avatar a card draws in place of the title's initials, if any. */
export function cardAvatar<T>(
  item: T,
  identity: CardIdentity,
): { key: string } | string | undefined {
  if (!identity.avatarField) return undefined;
  const avatar: unknown = get(
    item as Record<string, unknown>,
    identity.avatarField,
  );
  if (typeof avatar === "string") return avatar || undefined;
  if (avatar && typeof avatar === "object" && "key" in avatar) {
    const { key } = avatar as { key: unknown };
    return typeof key === "string" && key ? { key } : undefined;
  }
  return undefined;
}

/** The narrowest a card of the `cards` display gets (backend `card.minWidth`). */
export const DEFAULT_CARD_MIN_WIDTH = "230px";

const CARD_GRID_GAP = "0.75rem";
const CARD_GRID_PADDING = "36px";

const CARD_MAX_WIDTH_FACTOR = 2;

/**
 * The cards grid: auto-fit tracks of at least `--dms-card-min-width` (the
 * whole row on a narrower screen), so a short list's empty tracks collapse
 * and its cards stretch across the row instead of leaving a hole at its end.
 */
export const CARD_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fit,minmax(min(var(--dms-card-min-width),100%),1fr))] gap-3 px-[18px] pt-4 pb-[18px]";

/**
 * The style of a cards grid holding `count` cards of at least `minWidth` (a
 * CSS length): the width its tracks start from, and a cap keeping one or two
 * cards from stretching across a whole wide screen.
 */
export function cardGridStyle(
  minWidth: string | undefined,
  count: number,
): CSSProperties {
  const width = minWidth || DEFAULT_CARD_MIN_WIDTH;
  const cards = Math.max(1, count);
  return {
    "--dms-card-min-width": width,
    maxWidth: `calc(${cards} * ${CARD_MAX_WIDTH_FACTOR} * ${width} + ${cards - 1} * ${CARD_GRID_GAP} + ${CARD_GRID_PADDING})`,
  };
}
