import type {
  BadgeItem,
  ColumnDisplay,
  DataTypeValue,
  DisplayTone,
  FieldSpec,
  MappedResource,
  ProposedCategory,
  TabsChoice,
} from "@antelopejs/interface-dms-builder";
import { refuse } from "./mapping-refusal";
import { humanized, words } from "./name-words";
import { isCurrencyCode } from "./price-currency";

const BADGE_MIN_VALUES = 2;
const BADGE_MAX_VALUES = 10;
const TABS_MAX_VALUES = 6;

/** The value words a status is toned by; a word in none of these takes the next tone of the cycle. */
const TONE_WORDS: readonly (readonly [DisplayTone, readonly string[]])[] = [
  [
    "success",
    ["paid", "active", "done", "completed", "shipped", "delivered", "approved"],
  ],
  ["warning", ["pending", "draft", "processing", "waiting", "review"]],
  [
    "error",
    [
      "failed",
      "cancelled",
      "canceled",
      "refunded",
      "rejected",
      "error",
      "blocked",
    ],
  ],
  ["info", ["new", "open"]],
];

const TONE_OF_WORD = new Map<string, DisplayTone>(
  TONE_WORDS.flatMap(([tone, list]) =>
    list.map((word): [string, DisplayTone] => [word, tone]),
  ),
);

/** The tones the values no word tones take in turn, in category order. */
const TONE_CYCLE: readonly DisplayTone[] = [
  "primary",
  "secondary",
  "info",
  "neutral",
];

const TONES: ReadonlySet<string> = new Set<DisplayTone>([
  "neutral",
  "primary",
  "secondary",
  "success",
  "warning",
  "error",
  "info",
]);

/** A number column whose name ends in one of these words is an amount (D2). */
const MONEY_WORDS: ReadonlySet<string> = new Set([
  "total",
  "amount",
  "price",
  "cost",
  "revenue",
  "subtotal",
]);

/** A column named by one of these words is the one a table is tabbed by (T1). */
const STATUS_WORDS: ReadonlySet<string> = new Set([
  "status",
  "state",
  "stage",
  "type",
]);

const PRICE = "price";
const SELECT = "select";
const BADGE_DECLARATION = "string";
const PRICE_DECLARATION = "number";

/** What a display rule reads about a column. */
export interface DisplayFacts {
  column: string;
  declared: string;
  isRelation: boolean;
  enumLike: boolean;
  categories?: ProposedCategory[];
  nulls?: number;
  /** The rows the profile was measured on. */
  rows?: number;
  /** The ISO 4217 code the database states for an amount column, when it does. */
  currency?: string;
}

/** A display a rule chose, and the rule. */
export interface ChosenDisplay {
  display: ColumnDisplay;
  rule: "D1" | "D2";
}

/** A code such as a country or currency code (`NL`, `EUR`), which reads as written, not humanized. */
const CODE_VALUE = /^[A-Z][A-Z0-9_-]*$/;

function badgeLabel(value: string): string {
  return CODE_VALUE.test(value) ? value : humanized(value) || value;
}

/** The items of a badge, the values given in the order the tones are dealt. */
export function badgeItems(values: string[]): BadgeItem[] {
  let cycled = 0;
  return values.map((value) => {
    const known = TONE_OF_WORD.get(value.trim().toLowerCase());
    const tone = known ?? TONE_CYCLE[cycled++ % TONE_CYCLE.length];
    return { value, label: badgeLabel(value), tone };
  });
}

/** Whether a value is text, as a JSON body or a profile holds it. */
function isText(value: unknown): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}

function stringValues(categories: ProposedCategory[]): string[] | undefined {
  const values = categories.map((category) => category.value);
  return values.every(isText) ? values : undefined;
}

/**
 * A badge when every non-null row falls in a category: the profile drops the categories it counts
 * too rarely, so a gap between their rows and the rows means a value would show unmatched.
 */
function proposeBadge(facts: DisplayFacts): ColumnDisplay | undefined {
  const { categories, rows } = facts;
  if (
    !facts.enumLike ||
    facts.declared !== BADGE_DECLARATION ||
    facts.isRelation ||
    !categories ||
    rows === undefined ||
    categories.length < BADGE_MIN_VALUES ||
    categories.length > BADGE_MAX_VALUES
  ) {
    return undefined;
  }
  const covered = categories.reduce((sum, category) => sum + category.rows, 0);
  const values = stringValues(
    [...categories].sort((left, right) => right.rows - left.rows),
  );
  return values && covered === rows - (facts.nulls ?? 0)
    ? { kind: "badge", items: badgeItems(values) }
    : undefined;
}

/** Whether the name's last word says money: `unit_price`, `unitPrice`, `total`, not `total_items`. */
export function isMoneyName(column: string): boolean {
  const last = words(column).at(-1);
  return last !== undefined && MONEY_WORDS.has(last);
}

function priceDisplay(currency: string | undefined): ColumnDisplay {
  return currency ? { kind: PRICE, currency } : { kind: PRICE };
}

/** The display the data calls for: a badge (D1) or a price (D2), else none. */
export function proposeDisplay(facts: DisplayFacts): ChosenDisplay | undefined {
  const badge = proposeBadge(facts);
  if (badge) {
    return { display: badge, rule: "D1" };
  }
  return facts.declared === PRICE_DECLARATION &&
    !facts.isRelation &&
    isMoneyName(facts.column)
    ? { display: priceDisplay(facts.currency), rule: "D2" }
    : undefined;
}

/** A column that may carry the tabs, with the display it is proposed. */
export interface TabCandidate {
  column: string;
  display?: ColumnDisplay;
  filterable: boolean;
}

/**
 * The column to tab a TableView by (T1): of the filterable badge columns of two to six values, the
 * first named like a status, else the one with the fewest values.
 */
export function proposeTabs(
  candidates: TabCandidate[],
): TabsChoice | undefined {
  const sized = candidates.flatMap((candidate) =>
    candidate.filterable && candidate.display?.kind === "badge"
      ? [{ column: candidate.column, size: candidate.display.items.length }]
      : [],
  );
  const eligible = sized.filter(
    (entry) => entry.size >= BADGE_MIN_VALUES && entry.size <= TABS_MAX_VALUES,
  );
  const named = eligible.find((entry) =>
    words(entry.column).some((word) => STATUS_WORDS.has(word)),
  );
  const fewest = eligible.reduce<(typeof eligible)[number] | undefined>(
    (best, entry) => (best && best.size <= entry.size ? best : entry),
    undefined,
  );
  const chosen = named ?? fewest;
  return chosen ? { column: chosen.column } : undefined;
}

/** Why a display cannot be written on a column of this declaration, if it cannot. */
export function displayRefusal(
  display: ColumnDisplay,
  declared: string,
): string | undefined {
  if (display.kind === PRICE) {
    if (display.currency !== undefined && !isCurrencyCode(display.currency)) {
      return `the price currency ${JSON.stringify(display.currency)} is not an ISO 4217 code such as USD`;
    }
    return declared === PRICE_DECLARATION
      ? undefined
      : `a price display needs a ${PRICE_DECLARATION} column, not ${declared}`;
  }
  if (display.kind !== "badge") {
    return `unknown display ${JSON.stringify(display)}`;
  }
  if (declared !== BADGE_DECLARATION) {
    return `a badge display needs a ${BADGE_DECLARATION} column, not ${declared}`;
  }
  if (display.items.length === 0) {
    return "a badge display needs at least one item";
  }
  const seen = new Set<string>();
  for (const item of display.items) {
    if (!isText(item.value) || seen.has(item.value)) {
      return `the badge item "${String(item.value)}" is not a string, or is given twice`;
    }
    seen.add(item.value);
    if (!isText(item.label) || item.label === "") {
      return `the badge item "${item.value}" has no label`;
    }
    if (!TONES.has(item.tone)) {
      return `the badge item "${item.value}" has the tone "${String(item.tone)}", which is not a tone of the dashboard`;
    }
  }
  return undefined;
}

/** The DataType a display writes on the controller's field. */
export function displayDataType(display: ColumnDisplay): DataTypeValue {
  if (display.kind === PRICE) {
    return display.currency
      ? { $dataType: PRICE, config: { currency: display.currency } }
      : { $dataType: PRICE };
  }
  return {
    $dataType: SELECT,
    config: {
      items: display.items.map((item) => ({
        label: item.label,
        value: item.value,
        textColor: item.tone,
      })),
    },
  };
}

function isTone(value: unknown): value is DisplayTone {
  return isText(value) && TONES.has(value);
}

/** An item of a select's config as the controller's code holds it, or whatever else it holds. */
interface StoredItem {
  value?: unknown;
  label?: unknown;
  textColor?: unknown;
}

function badgeItemOf(entry: StoredItem | null): BadgeItem | undefined {
  const { value, label, textColor } = entry ?? {};
  return isText(value) && isText(label) && isTone(textColor)
    ? { value, label, tone: textColor }
    : undefined;
}

/** The display a controller field's DataType was written from, when it is one this module writes. */
export function displayOfDataType(
  dataType: DataTypeValue | undefined,
): ColumnDisplay | undefined {
  if (dataType?.$dataType === PRICE) {
    const currency: unknown = dataType.config?.currency;
    return priceDisplay(isCurrencyCode(currency) ? currency : undefined);
  }
  const items: unknown = dataType?.config?.items;
  if (dataType?.$dataType !== SELECT || !Array.isArray(items)) {
    return undefined;
  }
  const badges = items.map(badgeItemOf);
  return badges.length > 0 && badges.every((item) => item !== undefined)
    ? { kind: "badge", items: badges }
    : undefined;
}

/** A tab of the TableView, as the page's block config holds it. */
export type TabConfig = {
  id: string;
  label: string;
  filter?: { accessorKey: string; value: string; mode: string };
  textColor?: DisplayTone;
};

function tabId(column: string, value: string): string {
  return [...words(column), ...words(value)].join("-");
}

/** "All", then a tab per value of the badge, in its order, drawn in its tone. */
export function tabsOf(column: string, display: ColumnDisplay): TabConfig[] {
  if (display.kind !== "badge") {
    return [];
  }
  const taken = new Set<string>(["all"]);
  const tabs = display.items.map((item, index) => {
    const id = tabId(column, item.value);
    const unique = taken.has(id) ? `${id}-${index}` : id;
    taken.add(unique);
    return {
      id: unique,
      label: item.label,
      filter: { accessorKey: column, value: item.value, mode: "is" },
      textColor: item.tone,
    };
  });
  return [{ id: "all", label: "All" }, ...tabs];
}

/**
 * The DataType of a controller field: its display's when it has one, which must suit the
 * declaration; else the declaration's own.
 */
export function fieldDataType(
  display: ColumnDisplay | undefined,
  declared: string,
  plain: DataTypeValue,
  where: string,
): DataTypeValue {
  if (!display) {
    return plain;
  }
  const refusal = displayRefusal(display, declared);
  if (refusal) {
    refuse(`${where}: ${refusal}`);
  }
  return displayDataType(display);
}

/** Whether a default display may be written on a column of this declaration. */
export function suits(display: ColumnDisplay, declared: string): boolean {
  return displayRefusal(display, declared) === undefined;
}

/**
 * The tabs of a TableView, over a badge column the controller shows and filters. Tabs left out are
 * proposed (T1) for a relation not mapped before, from the displays its columns are drawn with;
 * a relation mapped before keeps its page's tabs. Tabs of null write none.
 */
export function plannedTabs(
  resource: MappedResource,
  where: string,
  apiFields: FieldSpec[],
  displays: ReadonlyMap<string, ColumnDisplay>,
  proposed: boolean,
): TabConfig[] | undefined {
  if (!resource.tableView || resource.tabs === null) {
    return undefined;
  }
  const chosen =
    resource.tabs ??
    (proposed
      ? proposeTabs(
          apiFields.map((spec) => ({
            column: spec.name,
            display: displays.get(spec.name),
            filterable: spec.filterable === true,
          })),
        )
      : undefined);
  if (chosen === undefined) {
    return undefined;
  }
  const shown = apiFields.find((spec) => spec.name === chosen.column);
  const badge = displays.get(chosen.column);
  if (!shown?.filterable || badge?.kind !== "badge") {
    refuse(
      `tabs by ${where}.${chosen.column} need a column the TableView shows and filters, with a badge display`,
    );
  }
  return tabsOf(chosen.column, badge);
}
